export interface StockPoint {
  date: string;
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

export interface MarketAlert {
  id: string;
  timestamp: string;
  ticker: string;
  type: 'entry' | 'exit' | 'breakout';
  message: string;
  read: boolean;
}
