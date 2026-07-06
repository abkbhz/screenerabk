export interface StockPoint {
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

export interface StockDetails {
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
  recommendationScore: number;
  entryRecommendation: string;
  isLive?: boolean;
  projections?: Projections;
}

export interface ProjectionHorizon {
  label: string;
  days: number;
  weeks: number;
  expectedPct: number;
  lowPct: number;
  highPct: number;
}

export interface Projections {
  weeklyMeanReturn: number;
  weeklyStdReturn: number;
  horizons: ProjectionHorizon[];
}

export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  open?: boolean;
}

export interface BacktestResult {
  ticker: string;
  name: string;
  isLive: boolean;
  priceSeries: { date: string; close: number }[];
  equitySeries: { date: string; strategy: number; buyHold: number }[];
  trades: BacktestTrade[];
  stats: {
    totalReturnPct: number;
    buyHoldReturnPct: number;
    cagr: number;
    trades: number;
    winRatePct: number;
    maxDrawdownPct: number;
    years: number;
  };
}

export interface FilterConfig {
  closeAbove100: boolean;
  closeAbove20wEma: boolean;
  closeAbove50wEma: boolean;
  closeAbove200wEma: boolean;
  rsiBetween55And63: boolean;
  volumeAbove1_8Sma20: boolean;
  closeAbove8wHigh: boolean;
}

export interface AiAnalysis {
  summary: string;
  shouldBuyHoldSell: string;
  isEntryGood: string;
  entryReasoning: string;
  entryPriceTarget: string;
  stopLoss: string;
  takeProfitTarget: string;
  riskRewardRatio: string;
  catalystDetails: string;
}

// ---- Stage 2: Daily Decision Engine ----
export interface DailyChecks {
  closeAbove20Ema: boolean;
  rsiInZone: boolean;
  volumeSpike: boolean;
  notOverextended: boolean;
  hasUpsideToResistance: boolean;
}

export interface DailyTradePlan {
  entry: number;
  target: number;
  stopLoss: number;
  riskReward: string;
  holdingDays: number;
}

export interface DailyDecision {
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
    extensionPct: number;
    nextResistance: number | null;
    upsidePct: number | null;
  };
  trade: DailyTradePlan | null;
  isLive: boolean;
}

export interface MarketTrend {
  trend: 'Bullish' | 'Neutral' | 'Bearish';
  niftyClose: number;
  niftyEma20: number;
  isLive: boolean;
}

export interface DailyDecisionResponse {
  market: MarketTrend;
  results: DailyDecision[];
  summary: { buy: number; wait: number; avoid: number; total: number };
}

export interface MarketAlert {
  id: string;
  timestamp: string;
  ticker: string;
  type: 'entry' | 'exit' | 'breakout';
  message: string;
  read: boolean;
}
