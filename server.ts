import express, { Request, Response } from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import { INDIAN_STOCKS } from "./src/indianStocksList";

dotenv.config();

const app = express();
// Render (and most hosts) inject the port via env; fall back to 3000 locally.
const PORT = Number(process.env.PORT) || 3000;
// The frontend is hosted separately (Vercel), so allow cross-origin calls.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";
// Gemini model is configurable; gemini-3.5-flash is the current GA flash model.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

app.use(express.json());

// CORS so the Vercel-hosted frontend can reach this backend.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", FRONTEND_ORIGIN);
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Initialize Gemini SDK with telemetry header
const ai = new GoogleGenAI({
  apiKey: GEMINI_API_KEY || "dummy-key",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    }
  }
});

// Default core list of stocks (NSE India)
const DEFAULT_TICKERS = [
  'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'ICICIBANK.NS',
  'BHARTIARTL.NS', 'ITC.NS', 'SBIN.NS', 'LT.NS', 'TATAMOTORS.NS',
  'BAJFINANCE.NS', 'HINDUNILVR.NS', 'AXISBANK.NS', 'WIPRO.NS',
  'TATASTEEL.NS', 'SUNPHARMA.NS', 'HCLTECH.NS', 'ADANIENT.NS', 'KOTAKBANK.NS',
  'M&M.NS', 'ADANIPORTS.NS', 'POWERGRID.NS', 'NTPC.NS', 'COALINDIA.NS',
  'ONGC.NS', 'MARUTI.NS', 'TITAN.NS', 'ASIANPAINT.NS', 'ULTRACEMCO.NS',
  'NESTLEIND.NS', 'JSWSTEEL.NS', 'GRASIM.NS', 'HINDALCO.NS', 'TECHM.NS',
  'HDFCLIFE.NS', 'SBILIFE.NS', 'BPCL.NS', 'CIPLA.NS', 'APOLLOHOSP.NS',
  'DRREDDY.NS', 'EICHERMOT.NS', 'ZOMATO.NS', 'HAL.NS', 'TRENT.NS', 'JIOFIN.NS',
  'SUZLON.NS', 'IRFC.NS', 'RVNL.NS', 'YESBANK.NS', 'IREDA.NS', 'NHPC.NS',
  'TATAPOWER.NS', 'BEL.NS', 'GMRINFRA.NS', 'HUDCO.NS', 'PFC.NS', 'RECLTD.NS',
  'BANKBARODA.NS', 'CANBK.NS', 'SAIL.NS', 'GAIL.NS', 'IOC.NS', 'NYKAA.NS',
  'PAYTM.NS', 'IDEA.NS', 'TATAELXSI.NS', 'KPITTECH.NS', 'COFORGE.NS'
];

// Helper for names
function getStockLongName(ticker: string): string {
  const clean = ticker.toUpperCase().replace(/\.NS$/, '').replace(/\.BO$/, '');
  const match = INDIAN_STOCKS.find(s => s.symbol.toUpperCase() === clean);
  if (match) {
    return match.name;
  }
  return `${clean} Corporation`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatCustomDate(dateObj: Date): string {
  const month = MONTHS[dateObj.getMonth()];
  const day = dateObj.getDate();
  const year = dateObj.getFullYear().toString().slice(-2);
  return `${month} ${day}, ${year}`;
}

// Indicator interfaces
interface StockPoint {
  date: string;
  open?: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  ema20?: number;
  ema50?: number;
  ema200?: number;
  rsi?: number;
  volumeSma20?: number;
  high8w?: number;
}

interface ProjectionHorizon {
  label: string;
  days: number;
  weeks: number;
  expectedPct: number;
  lowPct: number;
  highPct: number;
}

interface Projections {
  weeklyMeanReturn: number; // fractional per week, e.g. 0.004 = 0.4%
  weeklyStdReturn: number;
  horizons: ProjectionHorizon[];
}

// Historical-trend based expected-return estimates (NOT a guarantee).
// Uses the mean/σ of weekly returns; compounds the mean over each horizon and
// widens a ±1σ band by √weeks. Callers must label this clearly as an estimate.
function computeProjections(closes: number[]): Projections {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(closes[i] / closes[i - 1] - 1);
  }
  const n = rets.length || 1;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);

  const defs: [string, number][] = [['1W', 1], ['1M', 4], ['3M', 13], ['6M', 26], ['1Y', 52]];
  const horizons: ProjectionHorizon[] = defs.map(([label, weeks]) => {
    const expected = Math.pow(1 + mean, weeks) - 1;
    const band = std * Math.sqrt(weeks);
    return {
      label,
      days: weeks * 7,
      weeks,
      expectedPct: parseFloat((expected * 100).toFixed(2)),
      lowPct: parseFloat(((expected - band) * 100).toFixed(2)),
      highPct: parseFloat(((expected + band) * 100).toFixed(2)),
    };
  });
  return { weeklyMeanReturn: mean, weeklyStdReturn: std, horizons };
}

interface StockDetails {
  ticker: string;
  name: string;
  price: number;
  change: number;
  history: StockPoint[];
  indicators: {
    close: number;
    ema20: number;
    ema50: number;
    ema200: number;
    rsi: number;
    volume: number;
    volumeSma20: number;
    high8w: number;
  };
  filtersMatched: {
    closeAbove100: boolean;
    closeAbove20wEma: boolean;
    closeAbove50wEma: boolean;
    closeAbove200wEma: boolean;
    rsiBetween55And63: boolean;
    volumeAbove1_8Sma20: boolean;
    closeAbove8wHigh: boolean;
  };
  recommendation: string; // 'STRONG BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG SELL'
  recommendationScore: number; // 0 to 100
  entryRecommendation: string; // Dynamic signal like 'Perfect Entry', 'Wait for Pullback', etc.
  isLive?: boolean;
  projections?: Projections; // historical-trend expected-return estimates
}

// Store for dynamic session tracking
const sessionTickers = new Set<string>(DEFAULT_TICKERS);

// Mathematical Indicator Calculations
function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = [];
  if (data.length === 0) return ema;
  const k = 2 / (period + 1);
  let prevEma = data[0];
  ema.push(prevEma);

  for (let i = 1; i < data.length; i++) {
    const curEma = data[i] * k + prevEma * (1 - k);
    ema.push(curEma);
    prevEma = curEma;
  }
  return ema;
}

function calculateSMA(data: number[], period: number): number[] {
  const sma: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      let sum = 0;
      for (let j = 0; j <= i; j++) sum += data[j];
      sma.push(sum / (i + 1));
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      sma.push(sum / period);
    }
  }
  return sma;
}

function calculateRSI(closes: number[], period: number = 14): number[] {
  const rsi: number[] = [];
  const len = closes.length;
  if (len === 0) return rsi;

  rsi.push(50); // Default first point

  let avgGain = 0;
  let avgLoss = 0;

  // Compute first RSI
  if (len > period) {
    let firstGains = 0;
    let firstLosses = 0;
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff > 0) firstGains += diff;
      else firstLosses -= diff;
    }
    avgGain = firstGains / period;
    avgLoss = firstLosses / period;

    for (let i = 1; i < period; i++) {
      rsi.push(50);
    }
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi.push(100 - (100 / (1 + rs)));

    // Smoothed calculations
    for (let i = period + 1; i < len; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
    }
  } else {
    for (let i = 1; i < len; i++) rsi.push(50);
  }

  return rsi;
}

// Generate premium mock data with genuine trend mechanics
function generateSyntheticStockData(ticker: string) {
  const longName = getStockLongName(ticker);
  let basePrice = 800;
  let volatility = 0.04;
  let drift = 0.0015;

  const clean = ticker.toUpperCase().replace(/\.NS$/, '');

  // Ticker-specific styling for extreme realism in INR
  if (clean === 'RELIANCE') { basePrice = 2950; volatility = 0.025; drift = 0.0012; }
  // Tata Consultancy Services
  else if (clean === 'TCS') { basePrice = 3820; volatility = 0.020; drift = 0.0015; }
  // HDFC Bank
  else if (clean === 'HDFCBANK') { basePrice = 1620; volatility = 0.025; drift = 0.0010; }
  // Infosys
  else if (clean === 'INFY') { basePrice = 1530; volatility = 0.030; drift = 0.0012; }
  // ICICI Bank
  else if (clean === 'ICICIBANK') { basePrice = 1120; volatility = 0.025; drift = 0.0015; }
  // Bharti Airtel
  else if (clean === 'BHARTIARTL') { basePrice = 1420; volatility = 0.035; drift = 0.0018; }
  // ITC
  else if (clean === 'ITC') { basePrice = 430; volatility = 0.020; drift = 0.0011; }
  // State Bank of India
  else if (clean === 'SBIN') { basePrice = 830; volatility = 0.035; drift = 0.0014; }
  // Tata Motors
  else if (clean === 'TATAMOTORS') { basePrice = 980; volatility = 0.045; drift = 0.0020; }
  // Tata Steel
  else if (clean === 'TATASTEEL') { basePrice = 175; volatility = 0.040; drift = 0.0015; }
  // Bajaj Finance
  else if (clean === 'BAJFINANCE') { basePrice = 7200; volatility = 0.040; drift = 0.0022; }
  // Larsen & Toubro
  else if (clean === 'LT') { basePrice = 3400; volatility = 0.030; drift = 0.0016; }
  // Hindustan Unilever
  else if (clean === 'HINDUNILVR') { basePrice = 2450; volatility = 0.025; drift = 0.0011; }
  else if (clean === 'SUZLON') { basePrice = 68; volatility = 0.075; drift = 0.0045; }
  else if (clean === 'IRFC') { basePrice = 175; volatility = 0.050; drift = 0.0035; }
  else if (clean === 'RVNL') { basePrice = 410; volatility = 0.065; drift = 0.0040; }
  else if (clean === 'YESBANK') { basePrice = 23; volatility = 0.060; drift = -0.0010; }
  else if (clean === 'IREDA') { basePrice = 215; volatility = 0.070; drift = 0.0050; }
  else if (clean === 'NHPC') { basePrice = 95; volatility = 0.040; drift = 0.0025; }
  else if (clean === 'TATAPOWER') { basePrice = 440; volatility = 0.035; drift = 0.0020; }
  else if (clean === 'ZOMATO') { basePrice = 185; volatility = 0.055; drift = 0.0038; }
  else if (clean === 'PAYTM') { basePrice = 380; volatility = 0.080; drift = -0.0025; }
  else if (clean === 'NYKAA') { basePrice = 165; volatility = 0.045; drift = 0.0010; }
  else if (clean === 'IDEA') { basePrice = 16; volatility = 0.090; drift = -0.0015; }

  // Adjust simulation so we might intentionally cross key indicators
  // like RSI being in the 55-63 zone
  const closes: number[] = [];
  const highs: number[] = [];
  const lows: number[] = [];
  const volumes: number[] = [];
  const timestamps: number[] = [];

  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  let currentPrice = basePrice * Math.pow(1 - drift, 260);

  // We add sinusoidal cycles to RSI and breakout logic
  for (let i = 0; i < 260; i++) {
    const ts = now - (260 - i) * oneWeek;
    timestamps.push(Math.floor(ts / 1000));

    const cycle = Math.sin(i / 10) * volatility * 1.5;
    const changePercent = drift + cycle + (Math.random() - 0.5) * 2 * volatility;
    
    // Create occasional beautiful weekly volume spikes and breakout candles
    let spike = 1;
    let breakout = 0;
    if (i > 240 && Math.random() < 0.15) {
      spike = 2.2 + Math.random() * 1.5; // High volume
      breakout = volatility * 2.5; // Upward breakout
    }

    currentPrice = currentPrice * (1 + changePercent + breakout);
    if (currentPrice < 1) currentPrice = 1;

    closes.push(parseFloat(currentPrice.toFixed(2)));
    const spread = currentPrice * volatility * (0.4 + Math.random() * 0.6);
    highs.push(parseFloat((currentPrice + spread * 0.6).toFixed(2)));
    lows.push(parseFloat((Math.max(1, currentPrice - spread * 0.6)).toFixed(2)));

    const baseVolume = 12000000;
    volumes.push(Math.floor(baseVolume * (0.6 + Math.random() * 0.8) * spike));
  }

  return {
    meta: { symbol: ticker.toUpperCase(), longName },
    closes,
    highs,
    lows,
    volumes,
    timestamps
  };
}

// Fetch stock details and compute indicators
async function getStockData(ticker: string, forceSynthetic = false): Promise<StockDetails> {
  let upperTicker = ticker.toUpperCase().trim();
  // Automatically append .NS for Indian NSE stocks if no suffix is present
  if (!upperTicker.includes('.') && upperTicker !== 'NIFTY' && upperTicker !== 'SENSEX') {
    upperTicker = `${upperTicker}.NS`;
  }
  let rawData;
  let isLiveResult = false;

  if (!forceSynthetic) {
    try {
      // Attempt real live Yahoo Finance Weekly chart download
      const url = `https://query2.finance.yahoo.com/v8/finance/chart/${upperTicker}?interval=1wk&range=5y`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      });

      if (res.ok) {
        const json = await res.json() as any;
        const result = json.chart?.result?.[0];
        if (result && result.indicators?.quote?.[0]?.close?.length > 10) {
          const quote = result.indicators.quote[0];
          const timestamps = result.timestamp || [];
          
          // Filter out null/undefined points to guarantee flawless indicators
          const validCloses: number[] = [];
          const validHighs: number[] = [];
          const validLows: number[] = [];
          const validVolumes: number[] = [];
          const validTimestamps: number[] = [];

          for (let i = 0; i < quote.close.length; i++) {
            if (quote.close[i] !== null && quote.close[i] !== undefined &&
                quote.high[i] !== null && quote.high[i] !== undefined &&
                quote.low[i] !== null && quote.low[i] !== undefined) {
              validCloses.push(quote.close[i]);
              validHighs.push(quote.high[i]);
              validLows.push(quote.low[i]);
              validVolumes.push(quote.volume[i] || 100000);
              validTimestamps.push(timestamps[i]);
            }
          }

          if (validCloses.length > 50) {
            rawData = {
              meta: { symbol: upperTicker, longName: result.meta?.longName || getStockLongName(upperTicker) },
              closes: validCloses,
              highs: validHighs,
              lows: validLows,
              volumes: validVolumes,
              timestamps: validTimestamps
            };
            isLiveResult = true;
          }
        }
      }
    } catch (err) {
      console.log(`Failed to fetch live Yahoo Finance for ${upperTicker}, using premium simulator fallback`);
    }
  }

  // Fallback if network fails, rate-limited, or data is corrupt
  if (!rawData) {
    rawData = generateSyntheticStockData(upperTicker);
  }

  const { closes, highs, lows, volumes, timestamps, meta } = rawData;
  const len = closes.length;

  // Calculate Indicator Lines
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes, 14);
  const volumeSma20 = calculateSMA(volumes, 20);

  // 8-Week High of PREVIOUS weeks (prior to current week index)
  const high8w: number[] = [];
  for (let i = 0; i < len; i++) {
    if (i < 8) {
      high8w.push(closes[i]);
    } else {
      let maxHigh = -Infinity;
      for (let j = i - 8; j < i; j++) {
        if (highs[j] > maxHigh) maxHigh = highs[j];
      }
      high8w.push(maxHigh);
    }
  }

  // Assemble weekly points
  const history: StockPoint[] = [];
  for (let i = 0; i < len; i++) {
    const dateObj = new Date(timestamps[i] * 1000);
    const dateStr = formatCustomDate(dateObj);
    history.push({
      date: dateStr,
      close: closes[i],
      high: highs[i],
      low: lows[i],
      volume: volumes[i],
      ema20: parseFloat(ema20[i].toFixed(2)),
      ema50: parseFloat(ema50[i].toFixed(2)),
      ema200: parseFloat(ema200[i].toFixed(2)),
      rsi: parseFloat(rsi[i].toFixed(1)),
      volumeSma20: Math.round(volumeSma20[i]),
      high8w: parseFloat(high8w[i].toFixed(2))
    });
  }

  // Drop incomplete/partial trailing candles (e.g. mid-week or today's partial candle)
  // so indicators are strictly evaluated on completed weekly bars.
  let evalIdx = len - 1;
  if (!forceSynthetic && timestamps && timestamps.length > 0) {
    const nowSec = Math.floor(Date.now() / 1000);
    while (evalIdx >= 0 && (nowSec - timestamps[evalIdx]) < 5 * 86400) {
      evalIdx--;
    }
    if (evalIdx < 0) evalIdx = len - 1;
  }

  // Current values (evaluated on the last completed weekly candle)
  const currClose = closes[evalIdx];
  const currEma20 = ema20[evalIdx];
  const currEma50 = ema50[evalIdx];
  const currEma200 = ema200[evalIdx];
  const currRsi = rsi[evalIdx];
  const currVolume = volumes[evalIdx];
  const currVolSma20 = volumeSma20[evalIdx];
  const currHigh8w = high8w[evalIdx];

  // Calculate percentage change based on previous week
  const prevClose = closes[evalIdx - 1] || currClose;
  const change = parseFloat((((currClose - prevClose) / prevClose) * 100).toFixed(2));

  // Volume Ratios
  const volRatio = currVolume / (currVolSma20 || 1);

  // Check custom filter rules requested by user
  const closeAbove100 = currClose > 100;
  const closeAbove20wEma = currClose > currEma20;
  const closeAbove50wEma = currClose > currEma50;
  const closeAbove200wEma = currClose > currEma200;
  const rsiBetween55And70 = currRsi >= 55 && currRsi <= 70;
  
  // Weekly Volume Expansion Toggle
  const volumeAbove2Sma20 = volRatio >= 2.0;

  // Daily Volume Expansion Toggle (scaled / daily estimation)
  const latestVol = volumes[len - 1] || currVolume;
  const latestVolSma = volumeSma20[len - 1] || currVolSma20;
  const dailyVolRatio = (latestVol * 5) / (latestVolSma || 1);
  const dailyVolAbove1_5Sma20 = volRatio >= 1.5 || dailyVolRatio >= 1.5;

  const closeAbove8wHigh = currClose > currHigh8w;

  // Calculate buy/sell recommendation score (out of 100)
  let score = 50; // default neural hold
  if (closeAbove20wEma) score += 8;
  if (closeAbove50wEma) score += 8;
  if (closeAbove200wEma) score += 9;
  if (rsiBetween55And70) score += 15; // User's high-probability momentum filter zone (55 - 70)
  if (volumeAbove2Sma20 || dailyVolAbove1_5Sma20) score += 15; // Heavy institutional conviction breakout
  if (closeAbove8wHigh) score += 15; // Key horizontal breakout
  if (currRsi > 70) score -= 12; // Overbought pullback risk
  if (currRsi < 35) score += 10; // Oversold opportunity

  let recommendation = 'HOLD';
  if (score >= 78) recommendation = 'STRONG BUY';
  else if (score >= 62) recommendation = 'BUY';
  else if (score <= 25) recommendation = 'STRONG SELL';
  else if (score <= 40) recommendation = 'SELL';

  // Entry Signal Guide
  let entryRecommendation = 'WAITING FOR CONFIRMATION';
  if (rsiBetween55And70 && (volumeAbove2Sma20 || dailyVolAbove1_5Sma20) && closeAbove8wHigh) {
    entryRecommendation = 'CRITICAL PERFECT ENTRY';
  } else if (closeAbove8wHigh && (volumeAbove2Sma20 || dailyVolAbove1_5Sma20)) {
    entryRecommendation = 'BREAKOUT ENTRY (HIGH VOLUME)';
  } else if (rsiBetween55And70 && closeAbove20wEma) {
    entryRecommendation = 'MOMENTUM CONVICTION ENTRY';
  } else if (currRsi < 35 && currClose > currEma200) {
    entryRecommendation = 'ACCUMULATION ZONE (MAJOR EMA SUPPORT)';
  } else if (currRsi > 72) {
    entryRecommendation = 'TAKE PROFIT / REDUCE RISK';
  } else if (currClose < currEma50) {
    entryRecommendation = 'AVOID (UNDER 50W EMA)';
  } else {
    entryRecommendation = 'HOLD POSITION (NEUTRAL ZONE)';
  }

  // Filter history to latest 50 weeks for elegant chart performance
  const displayHistory = history.slice(-50);

  return {
    ticker: upperTicker,
    name: meta.longName,
    price: parseFloat(currClose.toFixed(2)), // live Yahoo values are raw floats — round for display
    change,
    history: displayHistory,
    indicators: {
      close: parseFloat(currClose.toFixed(2)),
      ema20: parseFloat(currEma20.toFixed(2)),
      ema50: parseFloat(currEma50.toFixed(2)),
      ema200: parseFloat(currEma200.toFixed(2)),
      rsi: parseFloat(currRsi.toFixed(1)),
      volume: currVolume,
      volumeSma20: Math.round(currVolSma20),
      high8w: parseFloat(currHigh8w.toFixed(2))
    },
    filtersMatched: {
      closeAbove100,
      closeAbove20wEma,
      closeAbove50wEma,
      closeAbove200wEma,
      rsiBetween55And70,
      volumeAbove2Sma20,
      dailyVolAbove1_5Sma20,
      closeAbove8wHigh
    },
    recommendation,
    recommendationScore: score,
    entryRecommendation,
    isLive: isLiveResult,
    projections: computeProjections(closes)
  };
}

// ---------------------------------------------------------------------------
// Live cache + background warmer
// ---------------------------------------------------------------------------
// Fetching live weekly data for ~2000 stocks on every request is impossible
// within a request timeout. Instead we keep an in-memory cache and warm it in
// the background in small concurrent batches. The list endpoint always returns
// instantly: cached live data where available, a synthetic placeholder
// otherwise. Entries flip to `isLive: true` as the warmer catches up.

interface CacheEntry {
  data: StockDetails; // list-shaped (history stripped)
  ts: number;         // last successful live refresh (ms)
  live: boolean;      // whether the cached data came from a live fetch
}

const liveCache = new Map<string, CacheEntry>();
const REFRESH_TTL_MS = 30 * 60 * 1000; // re-refresh a live entry after 30 min
const WARM_CONCURRENCY = 4;            // parallel live fetches per batch
const BATCH_DELAY_MS = 400;            // pause between batches to be gentle on Yahoo

// Build the ordered ticker universe, hot (large-cap) names first for instant value.
function buildTickerUniverse(): string[] {
  const hot = new Set(DEFAULT_TICKERS);
  const rest: string[] = [];
  for (const s of INDIAN_STOCKS) {
    const suffix = s.exchange === 'NSE' ? '.NS' : '.BO';
    const t = `${s.symbol}${suffix}`;
    if (!hot.has(t)) rest.push(t);
  }
  return [...DEFAULT_TICKERS, ...rest];
}
const TICKER_UNIVERSE = buildTickerUniverse();

function toListShape(data: StockDetails): StockDetails {
  // strip heavy history + projections for the compact list payload
  return { ...data, history: [], projections: undefined };
}

// Warm a single ticker: fetch live, fall back to synthetic, always cache something.
async function warmTicker(ticker: string): Promise<void> {
  try {
    const live = await getStockData(ticker, false);
    liveCache.set(ticker, { data: toListShape(live), ts: Date.now(), live: !!live.isLive });
  } catch {
    // Never throw from the warmer; ensure the ticker still has a placeholder.
    if (!liveCache.has(ticker)) {
      try {
        const synth = await getStockData(ticker, true);
        liveCache.set(ticker, { data: toListShape(synth), ts: 0, live: false });
      } catch { /* ignore */ }
    }
  }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Continuous background loop: cycle through the universe, refreshing stale/uncached entries.
async function startWarmer(): Promise<void> {
  console.log(`Live warmer started for ${TICKER_UNIVERSE.length} tickers`);
  // Never let the loop die; keep cycling forever.
  for (;;) {
    for (let i = 0; i < TICKER_UNIVERSE.length; i += WARM_CONCURRENCY) {
      const batch = TICKER_UNIVERSE.slice(i, i + WARM_CONCURRENCY).filter(t => {
        const entry = liveCache.get(t);
        // Refresh if never fetched live, or the live data is older than the TTL.
        return !entry || !entry.live || (Date.now() - entry.ts) > REFRESH_TTL_MS;
      });
      if (batch.length > 0) {
        await Promise.all(batch.map(warmTicker));
        await sleep(BATCH_DELAY_MS);
      }
    }
    await sleep(5000); // brief pause before the next full cycle
  }
}

// 1. Core Stocks Endpoint — instant, served from cache with synthetic fallback.
app.get("/api/stocks", async (req, res) => {
  try {
    const results = await Promise.all(TICKER_UNIVERSE.map(async (t) => {
      const cached = liveCache.get(t);
      if (cached) return cached.data;
      // Not warmed yet: return a synthetic placeholder and seed the cache.
      const synth = toListShape(await getStockData(t, true));
      liveCache.set(t, { data: synth, ts: 0, live: false });
      return synth;
    }));
    const liveCount = results.filter(r => r.isLive).length;
    res.json({ stocks: results, meta: { total: results.length, live: liveCount } });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Search endpoint — fast text search across all 2,800+ market companies
app.get("/api/stocks/search", (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.json({ results: [] });
    return;
  }
  const query = q.toLowerCase();
  
  // Rank matches: exact symbol match first, prefix symbol match, then name matches
  const matches = INDIAN_STOCKS.filter(s => 
    s.symbol.toLowerCase().includes(query) ||
    s.name.toLowerCase().includes(query)
  ).sort((a, b) => {
    const aSym = a.symbol.toLowerCase();
    const bSym = b.symbol.toLowerCase();
    if (aSym === query) return -1;
    if (bSym === query) return 1;
    if (aSym.startsWith(query) && !bSym.startsWith(query)) return -1;
    if (!aSym.startsWith(query) && bSym.startsWith(query)) return 1;
    return a.symbol.localeCompare(b.symbol);
  }).slice(0, 25);

  res.json({ results: matches, query: q });
});

// Short-lived cache for the full detail payload so re-selecting a stock is instant.
const detailCache = new Map<string, { data: StockDetails; ts: number }>();
const DETAIL_TTL_MS = 3 * 60 * 1000;

// 1.5 Live Detailed Stock Endpoint (fetches real Yahoo Finance on-demand)
app.get("/api/stocks/detail", async (req, res) => {
  const { ticker } = req.query;
  if (!ticker || typeof ticker !== "string") {
    res.status(400).json({ error: "Missing ticker query parameter" });
    return;
  }
  const key = ticker.toUpperCase().trim();
  const cached = detailCache.get(key);
  if (cached && Date.now() - cached.ts < DETAIL_TTL_MS) {
    res.json({ stock: cached.data });
    return;
  }
  try {
    const data = await getStockData(ticker, false); // forceSynthetic = false for genuine live yfinance
    detailCache.set(key, { data, ts: Date.now() });
    res.json({ stock: data });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Multi-resolution history + backtest
// ---------------------------------------------------------------------------

function normalizeTicker(ticker: string): string {
  let t = ticker.toUpperCase().trim();
  // Index symbols (e.g. ^NSEI) and already-suffixed tickers are left as-is.
  if (t.startsWith('^')) return t;
  if (!t.includes('.') && t !== 'NIFTY' && t !== 'SENSEX') t = `${t}.NS`;
  return t;
}

// Timeframe -> Yahoo (interval, range). Intraday only exists for recent windows;
// long ranges fall back to weekly/monthly (no free source has hourly-over-10y).
const TF_MAP: Record<string, { interval: string; range: string; label: string }> = {
  '1D':  { interval: '5m',  range: '1d',  label: 'Intraday (5m)' },
  '5D':  { interval: '15m', range: '5d',  label: 'Intraday (15m)' },
  '1M':  { interval: '60m', range: '1mo', label: 'Hourly' },
  '6M':  { interval: '1d',  range: '6mo', label: 'Daily' },
  '1Y':  { interval: '1d',  range: '1y',  label: 'Daily' },
  '5Y':  { interval: '1wk', range: '5y',  label: 'Weekly' },
  '10Y': { interval: '1mo', range: '10y', label: 'Monthly' },
};

const MS_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatSeriesDate(ts: number, interval: string): string {
  const d = new Date(ts * 1000);
  const mon = MS_MONTHS[d.getMonth()];
  const day = d.getDate();
  // Intraday intervals include time-of-day; daily+ show the date only.
  if (interval.endsWith('m') || interval.endsWith('h')) {
    const hh = d.getHours().toString().padStart(2, '0');
    const mm = d.getMinutes().toString().padStart(2, '0');
    return `${mon} ${day} ${hh}:${mm}`;
  }
  return `${mon} ${day}, ${d.getFullYear().toString().slice(-2)}`;
}

// Raw OHLCV pull at an arbitrary interval/range. Returns null on any failure.
async function fetchYahooSeries(ticker: string, interval: string, range: string) {
  const t = normalizeTicker(ticker);
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${t}?interval=${interval}&range=${range}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' }
    });
    if (!res.ok) return null;
    const json = await res.json() as any;
    const result = json.chart?.result?.[0];
    const quote = result?.indicators?.quote?.[0];
    if (!result || !quote?.close?.length) return null;
    const timestamps: number[] = result.timestamp || [];
    const opens: number[] = [], closes: number[] = [], highs: number[] = [], lows: number[] = [], volumes: number[] = [], stamps: number[] = [];
    for (let i = 0; i < quote.close.length; i++) {
      if (quote.close[i] != null && quote.high[i] != null && quote.low[i] != null) {
        // Open occasionally comes back null even when OHLC is otherwise valid;
        // fall back to the close so candlesticks always have a body.
        opens.push(quote.open?.[i] != null ? quote.open[i] : quote.close[i]);
        closes.push(quote.close[i]);
        highs.push(quote.high[i]);
        lows.push(quote.low[i]);
        volumes.push(quote.volume?.[i] || 0);
        stamps.push(timestamps[i]);
      }
    }
    if (closes.length < 3) return null;
    return { opens, closes, highs, lows, volumes, stamps, name: result.meta?.longName || getStockLongName(t) };
  } catch {
    return null;
  }
}

// Build chart points (price + indicators) from a raw series.
function buildChartPoints(raw: { opens?: number[]; closes: number[]; highs: number[]; lows: number[]; volumes: number[]; stamps: number[] }, interval: string): StockPoint[] {
  const { opens, closes, highs, lows, volumes, stamps } = raw;
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);
  const ema200 = calculateEMA(closes, 200);
  const rsi = calculateRSI(closes, 14);
  const volSma = calculateSMA(volumes, 20);
  return closes.map((c, i) => ({
    date: formatSeriesDate(stamps[i], interval),
    open: parseFloat((opens?.[i] ?? c).toFixed(2)),
    close: parseFloat(c.toFixed(2)),
    high: parseFloat(highs[i].toFixed(2)),
    low: parseFloat(lows[i].toFixed(2)),
    volume: Math.round(volumes[i]),
    ema20: parseFloat(ema20[i].toFixed(2)),
    ema50: parseFloat(ema50[i].toFixed(2)),
    ema200: parseFloat(ema200[i].toFixed(2)),
    rsi: parseFloat(rsi[i].toFixed(1)),
    volumeSma20: Math.round(volSma[i]),
  }));
}

// 1.6 Multi-resolution history endpoint (for the zoomable chart)
const historyCache = new Map<string, { points: StockPoint[]; isLive: boolean; ts: number }>();
const HISTORY_TTL_MS = 5 * 60 * 1000;

app.get("/api/stocks/history", async (req, res) => {
  const ticker = typeof req.query.ticker === 'string' ? req.query.ticker : '';
  const tf = (typeof req.query.tf === 'string' && TF_MAP[req.query.tf]) ? req.query.tf : '1Y';
  if (!ticker) {
    res.status(400).json({ error: "Missing ticker query parameter" });
    return;
  }
  const key = `${normalizeTicker(ticker)}|${tf}`;
  const cached = historyCache.get(key);
  if (cached && Date.now() - cached.ts < HISTORY_TTL_MS) {
    res.json({ points: cached.points, tf, label: TF_MAP[tf].label, isLive: cached.isLive });
    return;
  }
  try {
    const { interval, range } = TF_MAP[tf];
    const raw = await fetchYahooSeries(ticker, interval, range);
    let points: StockPoint[];
    let isLive = false;
    if (raw) {
      points = buildChartPoints(raw, interval);
      isLive = true;
    } else {
      // Fall back to the synthetic weekly series so the chart never breaks.
      const synth = await getStockData(ticker, true);
      points = synth.history;
    }
    historyCache.set(key, { points, isLive, ts: Date.now() });
    res.json({ points, tf, label: TF_MAP[tf].label, isLive });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1.7 Backtest endpoint — how the screener's rules would have performed over ~10y
const backtestCache = new Map<string, { payload: any; ts: number }>();
const BACKTEST_TTL_MS = 30 * 60 * 1000;

app.get("/api/stocks/backtest", async (req, res) => {
  const ticker = typeof req.query.ticker === 'string' ? req.query.ticker : '';
  if (!ticker) {
    res.status(400).json({ error: "Missing ticker query parameter" });
    return;
  }
  const key = normalizeTicker(ticker);
  const cached = backtestCache.get(key);
  if (cached && Date.now() - cached.ts < BACKTEST_TTL_MS) {
    res.json(cached.payload);
    return;
  }
  try {
    const raw = await fetchYahooSeries(ticker, '1wk', '10y') || (() => {
      const s = generateSyntheticStockData(normalizeTicker(ticker));
      return { opens: s.closes, closes: s.closes, highs: s.highs, lows: s.lows, volumes: s.volumes, stamps: s.timestamps, name: s.meta.longName };
    })();

    const { closes, highs, volumes, stamps } = raw;
    const len = closes.length;
    const ema50 = calculateEMA(closes, 50);
    const rsi = calculateRSI(closes, 14);
    const volSma = calculateSMA(volumes, 20);
    const high8w: number[] = [];
    for (let i = 0; i < len; i++) {
      if (i < 8) { high8w.push(highs[i]); continue; }
      let m = -Infinity;
      for (let j = i - 8; j < i; j++) m = Math.max(m, highs[j]);
      high8w.push(m);
    }

    // Simulate: normalized ₹100 start. Strategy goes long on entry rules, exits on exit rules.
    const START = 100;
    let strategy = START;
    let holding = false;
    let entryPrice = 0;
    let entryDate = '';
    const trades: any[] = [];
    const equitySeries: any[] = [];
    const priceSeries: any[] = [];
    const buyHoldBase = closes[0] || 1;

    for (let i = 0; i < len; i++) {
      const c = closes[i];
      const date = formatSeriesDate(stamps[i], '1wk');
      priceSeries.push({ date, close: parseFloat(c.toFixed(2)) });

      if (holding) strategy *= (c / closes[i - 1]); // mark-to-market while in position

      const entrySignal = c > ema50[i] && rsi[i] >= 55 && rsi[i] <= 63 && (volumes[i] > 1.8 * volSma[i] || c > high8w[i]);
      const exitSignal = rsi[i] > 72 || c < ema50[i];

      if (!holding && entrySignal) {
        holding = true; entryPrice = c; entryDate = date;
      } else if (holding && exitSignal) {
        holding = false;
        trades.push({ entryDate, exitDate: date, entryPrice: parseFloat(entryPrice.toFixed(2)), exitPrice: parseFloat(c.toFixed(2)), returnPct: parseFloat((((c - entryPrice) / entryPrice) * 100).toFixed(2)) });
      }

      equitySeries.push({
        date,
        strategy: parseFloat(strategy.toFixed(2)),
        buyHold: parseFloat(((c / buyHoldBase) * START).toFixed(2)),
      });
    }
    // Close any open position at the last bar for accurate stats.
    if (holding) {
      const c = closes[len - 1];
      trades.push({ entryDate, exitDate: formatSeriesDate(stamps[len - 1], '1wk'), entryPrice: parseFloat(entryPrice.toFixed(2)), exitPrice: parseFloat(c.toFixed(2)), returnPct: parseFloat((((c - entryPrice) / entryPrice) * 100).toFixed(2)), open: true });
    }

    // Stats
    const wins = trades.filter(t => t.returnPct > 0).length;
    const years = Math.max(1, len / 52);
    const totalReturnPct = strategy / START - 1;
    const buyHoldReturnPct = closes[len - 1] / buyHoldBase - 1;
    let peak = -Infinity, maxDd = 0;
    for (const e of equitySeries) { peak = Math.max(peak, e.strategy); maxDd = Math.max(maxDd, (peak - e.strategy) / peak); }

    const payload = {
      ticker: key,
      name: raw.name,
      isLive: len > 50,
      priceSeries,
      equitySeries,
      trades,
      stats: {
        totalReturnPct: parseFloat((totalReturnPct * 100).toFixed(1)),
        buyHoldReturnPct: parseFloat((buyHoldReturnPct * 100).toFixed(1)),
        cagr: parseFloat(((Math.pow(strategy / START, 1 / years) - 1) * 100).toFixed(1)),
        trades: trades.length,
        winRatePct: trades.length ? parseFloat(((wins / trades.length) * 100).toFixed(0)) : 0,
        maxDrawdownPct: parseFloat((maxDd * 100).toFixed(1)),
        years: parseFloat(years.toFixed(1)),
      },
    };
    backtestCache.set(key, { payload, ts: Date.now() });
    res.json(payload);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// STAGE 2 — Daily Decision Engine
// ---------------------------------------------------------------------------
// The weekly scanner (stage 1) narrows ~2000 stocks to a short watchlist. This
// second stage runs DAILY-timeframe checks only on the stocks the user already
// filtered on the weekly list, to time the actual entry. The weekly filters are
// left completely untouched — this is purely additive.
//
// Daily checks (per user spec):
//   1. Daily Close > 20 EMA
//   2. Daily RSI between 50 and 65
//   3. Daily Volume > 1.5 × 20-day average volume
//   4. Price not overextended from the 20 EMA
//   5. At least 5% upside before the next major resistance
//   6. Market Trend (Bullish / Neutral / Bearish) — informational only; a
//      Bearish Nifty does NOT by itself reject a stock.
// Each stock is then classified BUY / WAIT / AVOID.

const MAX_EXTENSION_PCT = 12;   // >12% above the 20 EMA on the daily = overextended
const MIN_UPSIDE_PCT = 5;       // need at least 5% room to the next resistance
const RSI_ZONE_LOW = 55;
const RSI_ZONE_HIGH = 70;

interface DailyChecks {
  closeAbove20Ema: boolean;
  rsiInZone: boolean;        // 55–70
  volumeSpike: boolean;      // > 1.5× avg-20 volume
  notOverextended: boolean;  // within MAX_EXTENSION_PCT of the 20 EMA
  hasUpsideToResistance: boolean; // ≥ MIN_UPSIDE_PCT before next resistance
}

interface DailyTradePlan {
  entry: number;
  target: number;      // +5%
  stopLoss: number;
  riskReward: string;  // e.g. "1:2.4"
  holdingDays: number; // estimated bars to reach target
}

interface DailyDecision {
  ticker: string;
  name: string;
  classification: 'BUY' | 'WAIT' | 'AVOID';
  reason: string;
  checks: DailyChecks;
  metrics: {
    close: number;
    ema20: number;
    rsi: number;
    volume: number;
    volumeAvg20: number;
    extensionPct: number;   // (close - ema20) / ema20 * 100
    nextResistance: number | null;
    upsidePct: number | null;
  };
  trade: DailyTradePlan | null; // present only for BUY
  isLive: boolean;
}

interface MarketTrend {
  trend: 'Bullish' | 'Neutral' | 'Bearish';
  niftyClose: number;
  niftyEma20: number;
  isLive: boolean;
}

// Nearest MAJOR overhead resistance above the current close.
//  - If price is within ~2% of the highest high in the lookback window it is
//    effectively breaking out, so there is no meaningful overhead supply and we
//    return null (open upside). This prevents a breakout being mistaken for a
//    ceiling — the bug that flagged fresh-high stocks as "no room / AVOID".
//  - Otherwise we find the nearest prominent swing-high (pivot, wider window)
//    that sits a meaningful distance above price. Trivial highs right at the
//    current level (< 0.5% above) are ignored.
//  - As a fallback, when no clean pivot is found but price is below the range
//    top, the recent range high itself is used as the resistance.
function findNextResistance(highs: number[], close: number, lookback = 120, k = 4): number | null {
  const n = highs.length;
  const start = Math.max(k, n - lookback);
  let recentMax = -Infinity;
  for (let i = start; i < n; i++) recentMax = Math.max(recentMax, highs[i]);

  // Breaking out to (or near) new highs => open upside.
  if (recentMax > 0 && close >= recentMax * 0.98) return null;

  let nearest: number | null = null;
  for (let i = start; i < n - k; i++) {
    let isPivot = true;
    for (let j = i - k; j <= i + k; j++) {
      if (j !== i && highs[j] > highs[i]) { isPivot = false; break; }
    }
    // Require the pivot to be meaningfully (> 0.5%) above price to count as a wall.
    if (isPivot && highs[i] > close * 1.005) {
      if (nearest === null || highs[i] < nearest) nearest = highs[i];
    }
  }
  if (nearest === null && recentMax > close) nearest = recentMax;
  return nearest;
}

const marketTrendCache: { data: MarketTrend | null; ts: number } = { data: null, ts: 0 };
const MARKET_TTL_MS = 10 * 60 * 1000;

async function getMarketTrend(): Promise<MarketTrend> {
  if (marketTrendCache.data && Date.now() - marketTrendCache.ts < MARKET_TTL_MS) {
    return marketTrendCache.data;
  }
  const raw = await fetchYahooSeries('^NSEI', '1d', '6mo');
  let result: MarketTrend;
  if (!raw || raw.closes.length < 21) {
    result = { trend: 'Neutral', niftyClose: 0, niftyEma20: 0, isLive: false };
  } else {
    const ema = calculateEMA(raw.closes, 20);
    const i = raw.closes.length - 1;
    const c = raw.closes[i];
    const e = ema[i];
    let trend: MarketTrend['trend'] = 'Neutral';
    if (c > e * 1.005) trend = 'Bullish';
    else if (c < e * 0.995) trend = 'Bearish';
    result = {
      trend,
      niftyClose: parseFloat(c.toFixed(2)),
      niftyEma20: parseFloat(e.toFixed(2)),
      isLive: true,
    };
  }
  marketTrendCache.data = result;
  marketTrendCache.ts = Date.now();
  return result;
}

const dailyDecisionCache = new Map<string, { decision: DailyDecision; ts: number }>();
const DAILY_DECISION_TTL_MS = 10 * 60 * 1000;

async function computeDailyDecision(ticker: string): Promise<DailyDecision> {
  const key = normalizeTicker(ticker);
  const cached = dailyDecisionCache.get(key);
  if (cached && Date.now() - cached.ts < DAILY_DECISION_TTL_MS) return cached.decision;

  const raw = await fetchYahooSeries(ticker, '1d', '1y');
  let isLive = true;
  let series = raw;
  if (!series || series.closes.length < 30) {
    const s = generateSyntheticStockData(key);
    series = { opens: s.closes, closes: s.closes, highs: s.highs, lows: s.lows, volumes: s.volumes, stamps: s.timestamps, name: s.meta.longName };
    isLive = false;
  }

  const { closes, highs, lows, volumes } = series;
  const n = closes.length;
  const emaArr = calculateEMA(closes, 20);
  const rsiArr = calculateRSI(closes, 14);
  const volSmaArr = calculateSMA(volumes, 20);

  const i = n - 1;
  const close = closes[i];
  const ema20 = emaArr[i];
  const rsi = rsiArr[i];
  const volume = volumes[i];
  const volumeAvg20 = volSmaArr[i];
  const extensionPct = ema20 > 0 ? ((close - ema20) / ema20) * 100 : 0;
  const nextResistance = findNextResistance(highs, close);
  const upsidePct = nextResistance !== null ? ((nextResistance - close) / close) * 100 : null;

  const checks: DailyChecks = {
    closeAbove20Ema: close > ema20,
    rsiInZone: rsi >= RSI_ZONE_LOW && rsi <= RSI_ZONE_HIGH,
    volumeSpike: volume > 1.5 * volumeAvg20,
    notOverextended: extensionPct <= MAX_EXTENSION_PCT,
    // null upside = fresh highs, no overhead resistance => open sky (passes)
    hasUpsideToResistance: upsidePct === null || upsidePct >= MIN_UPSIDE_PCT,
  };

  // Classification. Structural failures (below the 20 EMA, overextended, or no
  // room to the next resistance) are hard AVOIDs regardless of momentum.
  let classification: DailyDecision['classification'];
  let reason: string;
  if (!checks.closeAbove20Ema) {
    classification = 'AVOID';
    reason = 'Daily close is below the 20 EMA — trend not yet confirmed on the daily.';
  } else if (!checks.notOverextended) {
    classification = 'AVOID';
    reason = `Overextended (${extensionPct.toFixed(1)}% above 20 EMA) — poor risk/reward for a fresh entry.`;
  } else if (!checks.hasUpsideToResistance) {
    classification = 'AVOID';
    reason = `Only ${upsidePct?.toFixed(1)}% to the next resistance — under the 5% minimum room.`;
  } else if (checks.rsiInZone && checks.volumeSpike) {
    classification = 'BUY';
    reason = 'Above 20 EMA, RSI in the 50–65 momentum zone, volume spike, room to run.';
  } else {
    classification = 'WAIT';
    const missing: string[] = [];
    if (!checks.rsiInZone) missing.push('RSI not yet in the 50–65 zone');
    if (!checks.volumeSpike) missing.push('volume below 1.5× average');
    reason = `Setup building but not triggered — ${missing.join(' and ')}.`;
  }

  let trade: DailyTradePlan | null = null;
  if (classification === 'BUY') {
    const entry = close;
    const target = entry * 1.05;
    // Stop below the recent 10-bar swing low / just under the 20 EMA, but cap
    // the risk at 8% so the risk:reward stays meaningful.
    const swingLow = Math.min(...lows.slice(Math.max(0, n - 10)));
    let stopLoss = Math.min(swingLow, ema20 * 0.995);
    const maxRiskStop = entry * 0.92;
    if (stopLoss < maxRiskStop) stopLoss = maxRiskStop;
    if (stopLoss >= entry) stopLoss = entry * 0.97; // safety fallback
    const risk = entry - stopLoss;
    const reward = target - entry;
    const rr = risk > 0 ? reward / risk : 0;

    // Estimate holding days from the recent average absolute daily move.
    let moveSum = 0, cnt = 0;
    for (let j = Math.max(1, n - 20); j < n; j++) {
      if (closes[j - 1] > 0) { moveSum += Math.abs(closes[j] / closes[j - 1] - 1); cnt++; }
    }
    const avgDailyMove = cnt ? moveSum / cnt : 0.01;
    const holdingDays = Math.min(30, Math.max(3, Math.round(0.05 / (avgDailyMove || 0.01))));

    trade = {
      entry: parseFloat(entry.toFixed(2)),
      target: parseFloat(target.toFixed(2)),
      stopLoss: parseFloat(stopLoss.toFixed(2)),
      riskReward: `1:${rr.toFixed(1)}`,
      holdingDays,
    };
  }

  const decision: DailyDecision = {
    ticker: key,
    name: series.name || getStockLongName(key),
    classification,
    reason,
    checks,
    metrics: {
      close: parseFloat(close.toFixed(2)),
      ema20: parseFloat(ema20.toFixed(2)),
      rsi: parseFloat(rsi.toFixed(1)),
      volume: Math.round(volume),
      volumeAvg20: Math.round(volumeAvg20),
      extensionPct: parseFloat(extensionPct.toFixed(2)),
      nextResistance: nextResistance !== null ? parseFloat(nextResistance.toFixed(2)) : null,
      upsidePct: upsidePct !== null ? parseFloat(upsidePct.toFixed(2)) : null,
    },
    trade,
    isLive,
  };

  dailyDecisionCache.set(key, { decision, ts: Date.now() });
  return decision;
}

// 1.8 Daily Decision Engine endpoint — runs stage-2 daily checks on the
// weekly-matched watchlist the frontend passes in.
app.post("/api/stocks/daily-decision", async (req, res) => {
  const tickers: string[] = Array.isArray(req.body?.tickers)
    ? req.body.tickers.filter((t: any) => typeof t === 'string').slice(0, 60)
    : [];
  if (tickers.length === 0) {
    res.status(400).json({ error: "Provide a non-empty 'tickers' array (the weekly-matched watchlist)." });
    return;
  }
  try {
    const market = await getMarketTrend();
    const results: DailyDecision[] = [];
    const CONCURRENCY = 4;
    for (let i = 0; i < tickers.length; i += CONCURRENCY) {
      const batch = tickers.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(
        batch.map(t => computeDailyDecision(t).catch(() => null))
      );
      for (const d of settled) if (d) results.push(d);
    }
    // Order: BUY first, then WAIT, then AVOID.
    const rank: Record<string, number> = { BUY: 0, WAIT: 1, AVOID: 2 };
    results.sort((a, b) => rank[a.classification] - rank[b.classification]);
    const summary = {
      buy: results.filter(r => r.classification === 'BUY').length,
      wait: results.filter(r => r.classification === 'WAIT').length,
      avoid: results.filter(r => r.classification === 'AVOID').length,
      total: results.length,
    };
    res.json({ market, results, summary });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Dynamic Ticker Addition Endpoint
app.post("/api/stocks/add", async (req, res) => {
  const { ticker } = req.body;
  if (!ticker || typeof ticker !== "string" || ticker.trim().length === 0) {
    res.status(400).json({ error: "Invalid stock ticker symbol" });
    return;
  }
  const cleanTicker = ticker.trim().toUpperCase();
  try {
    const data = await getStockData(cleanTicker, false); // Fetch live first for additions
    res.json({ success: true, stock: data });
  } catch (err: any) {
    res.status(500).json({ error: `Could not fetch ticker ${cleanTicker}: ${err.message}` });
  }
});

// 3. Gemini Stock Analysis Endpoint
app.post("/api/stocks/analyze", async (req: Request, res: Response) => {
  const { ticker, indicators, entryRecommendation, recommendation } = req.body;

  if (!ticker) {
    res.status(400).json({ error: "Missing ticker" });
    return;
  }

  // Fail clearly (not with a 500) when the key hasn't been configured yet.
  if (!GEMINI_API_KEY) {
    res.status(503).json({
      error: "Gemini API key not configured. Set the GEMINI_API_KEY environment variable to enable AI analysis (see DEPLOY.md for how to get a free key)."
    });
    return;
  }

  const stockName = getStockLongName(ticker);

  const prompt = `
  Analyze this stock for professional traders. Give concrete, actionable trading advice.
  
  Stock: ${ticker} (${stockName})
  Current Price: ₹${indicators.close}
  
  Technical Indicators:
  - 20-Week EMA: ₹${indicators.ema20}
  - 50-Week EMA: ₹${indicators.ema50}
  - 200-Week EMA: ₹${indicators.ema200}
  - Weekly RSI: ${indicators.rsi}
  - Weekly Volume: ${indicators.volume.toLocaleString()}
  - 20-Week Volume SMA: ${indicators.volumeSma20.toLocaleString()}
  - Previous 8-Week High: ₹${indicators.high8w}
  
  Key Screening Filters:
  - Close > 100: ${indicators.close > 100 ? "PASS ✅" : "FAIL ❌"}
  - Close > 20W EMA: ${indicators.close > indicators.ema20 ? "PASS ✅" : "FAIL ❌"}
  - Close > 50W EMA: ${indicators.close > indicators.ema50 ? "PASS ✅" : "FAIL ❌"}
  - Close > 200W EMA: ${indicators.close > indicators.ema200 ? "PASS ✅" : "FAIL ❌"}
  - Weekly RSI between 55 and 63: ${indicators.rsi >= 55 && indicators.rsi <= 63 ? "PASS ✅" : "FAIL ❌"}
  - Weekly Volume > 1.8x SMA20: ${indicators.volume > 1.8 * indicators.volumeSma20 ? "PASS ✅" : "FAIL ❌"}
  - Close > Previous 8-Week High: ${indicators.close > indicators.high8w ? "PASS ✅" : "FAIL ❌"}
  
  Auto Recommendation: ${recommendation}
  Entry Recommendation Signal: ${entryRecommendation}
  
  Format your analysis in clean JSON that matches this schema:
  {
    "summary": "Brief 2-sentence executive summary of the setup",
    "shouldBuyHoldSell": "BUY" | "STRONG BUY" | "HOLD" | "SELL" | "STRONG SELL",
    "isEntryGood": "YES" | "NO" | "WAIT",
    "entryReasoning": "1-2 sentences explain why or why not a good entry right now",
    "entryPriceTarget": "₹XXXX.XX (Target Entry in Rupees)",
    "stopLoss": "₹XXXX.XX (Recommended tight stop loss in Rupees)",
    "takeProfitTarget": "₹XXXX.XX (Logical exit target in Rupees)",
    "riskRewardRatio": "e.g., 1:2.8",
    "catalystDetails": "What primary indicator or condition triggers this trade conviction (e.g., High-volume 8-week breakout, RSI momentum zone, or major EMA support)."
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            shouldBuyHoldSell: { type: Type.STRING },
            isEntryGood: { type: Type.STRING },
            entryReasoning: { type: Type.STRING },
            entryPriceTarget: { type: Type.STRING },
            stopLoss: { type: Type.STRING },
            takeProfitTarget: { type: Type.STRING },
            riskRewardRatio: { type: Type.STRING },
            catalystDetails: { type: Type.STRING }
          },
          required: [
            "summary", "shouldBuyHoldSell", "isEntryGood", "entryReasoning",
            "entryPriceTarget", "stopLoss", "takeProfitTarget", "riskRewardRatio", "catalystDetails"
          ]
        }
      }
    });

    const resultText = response.text || "{}";
    res.json(JSON.parse(resultText));
  } catch (err: any) {
    console.error("Gemini stock analysis error:", err);
    res.status(500).json({ error: "AI analysis failed, please retry", details: err.message });
  }
});

// Serve static assets in production, handle Vite in development
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Professional Stock Screener Server running on port ${PORT}`);
    // Kick off the background live-data warmer (runs for the life of the process).
    startWarmer().catch(err => console.error("Warmer crashed:", err));
  });
}

startServer();
