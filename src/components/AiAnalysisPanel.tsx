import { useState, useEffect } from "react";
import { AiAnalysis, StockDetails } from "../types";
import { Sparkles, ShieldCheck, TrendingUp, AlertTriangle, Play, HelpCircle, Loader2 } from "lucide-react";
import { apiUrl } from "../api";

interface AiAnalysisPanelProps {
  stock: StockDetails;
}

const LOADING_STEPS = [
  "Fetching 5-year historical candles...",
  "Calibrating weekly EMA intersections...",
  "Calculating Welles Wilder RSI momentum...",
  "Compiling volume breakout ratios...",
  "Running Gemini AI deep narrative engine..."
];

export default function AiAnalysisPanel({ stock }: AiAnalysisPanelProps) {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  useEffect(() => {
    // Clear previous analysis on stock swap to force freshness
    setAnalysis(null);
    setError(null);
  }, [stock.ticker]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 1500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const triggerAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/stocks/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: stock.ticker,
          indicators: stock.indicators,
          entryRecommendation: stock.entryRecommendation,
          recommendation: stock.recommendation
        })
      });

      if (!res.ok) {
        // Surface the backend's message (e.g. missing API key) instead of a generic error.
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to compile analysis");
      }

      const data = await res.json();
      setAnalysis(data);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const getRecommendationBadgeStyle = (rec: string) => {
    switch (rec) {
      case "STRONG BUY":
        return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/5";
      case "BUY":
        return "bg-emerald-500/5 text-emerald-500 border border-emerald-500/20";
      case "STRONG SELL":
        return "bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-lg shadow-rose-500/5";
      case "SELL":
        return "bg-rose-500/5 text-rose-500 border border-rose-500/20";
      default:
        return "bg-slate-800 text-slate-400 border border-slate-700";
    }
  };

  const getEntryBadgeStyle = (entry: string) => {
    switch (entry) {
      case "YES":
        return "bg-emerald-500/15 text-emerald-400 border border-emerald-400/20";
      case "NO":
        return "bg-rose-500/15 text-rose-400 border border-rose-400/20";
      default:
        return "bg-amber-500/15 text-amber-400 border border-amber-400/20";
    }
  };

  return (
    <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-5 backdrop-blur-md flex flex-col h-full">
      {/* Title */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <Sparkles size={16} className="text-emerald-400" />
          Gemini Real-Time Analyst
        </h3>
        <span className="text-[10px] font-mono text-slate-500 bg-[#0c101b] px-2 py-0.5 rounded border border-slate-800">
          POWERED BY GEMINI 3.5
        </span>
      </div>

      {!analysis && !loading && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-900/20 rounded-xl border border-dashed border-slate-800/80 my-auto">
          <Sparkles size={32} className="text-slate-600 mb-3 animate-pulse" />
          <h4 className="text-sm font-semibold text-slate-300">Run Tactical AI Diagnostics</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
            Generate an dynamic trading assessment with optimal entry/exit price bounds, stop loss values, and risk-to-reward ratios.
          </p>
          <button
            onClick={triggerAnalysis}
            className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-lg shadow-emerald-500/10 cursor-pointer"
          >
            <Play size={12} fill="currentColor" />
            Analyze {stock.ticker}
          </button>
        </div>
      )}

      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center p-12 text-center my-auto">
          <Loader2 size={36} className="text-emerald-400 animate-spin mb-4" />
          <h4 className="text-sm font-bold text-slate-200">Processing Chart Mechanics</h4>
          <p className="text-xs text-emerald-400 font-mono mt-2 min-h-[16px]">
            {LOADING_STEPS[loadingStep]}
          </p>
          <div className="w-40 bg-slate-800 h-1.5 rounded-full mt-4 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full animate-[loading-bar_1.5s_infinite]" />
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex flex-col gap-2">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle size={14} />
            Analysis Compile Failed
          </p>
          <p className="font-mono">{error}</p>
          <button
            onClick={triggerAnalysis}
            className="mt-1 self-start px-3 py-1 bg-rose-500/10 hover:bg-rose-500/25 text-rose-300 text-[11px] font-bold rounded-lg transition-all"
          >
            Retry Call
          </button>
        </div>
      )}

      {analysis && !loading && (
        <div className="flex-1 flex flex-col gap-4 animate-fade-in">
          {/* Summary Quote */}
          <div className="p-3 bg-slate-900/30 rounded-xl border border-slate-800/80">
            <p className="text-xs text-slate-300 italic leading-relaxed">
              &ldquo;{analysis.summary}&rdquo;
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#0c101b] rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase font-mono mb-1">Recommendation</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold inline-block ${getRecommendationBadgeStyle(analysis.shouldBuyHoldSell)}`}>
                {analysis.shouldBuyHoldSell}
              </span>
            </div>

            <div className="p-3 bg-[#0c101b] rounded-xl border border-slate-800">
              <span className="text-[10px] text-slate-500 block uppercase font-mono mb-1">Good Entry?</span>
              <span className={`px-2 py-0.5 rounded text-xs font-bold inline-block ${getEntryBadgeStyle(analysis.isEntryGood)}`}>
                {analysis.isEntryGood}
              </span>
            </div>
          </div>

          {/* Reasoning */}
          <div className="text-xs text-slate-400 leading-relaxed font-sans border-l-2 border-emerald-500/50 pl-3">
            <h4 className="font-semibold text-slate-200 mb-0.5">Tactical Reasoning</h4>
            {analysis.entryReasoning}
          </div>

          {/* Playbook Matrix */}
          <div className="bg-[#0c101b]/80 border border-slate-800/80 rounded-xl p-3.5 flex flex-col gap-3 font-mono">
            <div className="text-xs font-bold text-slate-300 border-b border-slate-800 pb-2 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400" />
              TRACTICAL TRADING PLAYBOOK
            </div>

            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 text-[10px] uppercase">Entry Target:</span>
                <span className="text-slate-200 font-bold">{analysis.entryPriceTarget}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 text-[10px] uppercase">Stop Loss:</span>
                <span className="text-rose-400 font-bold">{analysis.stopLoss}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 text-[10px] uppercase">Take Profit:</span>
                <span className="text-emerald-400 font-bold">{analysis.takeProfitTarget}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className="text-slate-500 text-[10px] uppercase">Risk/Reward:</span>
                <span className="text-amber-500 font-bold">{analysis.riskRewardRatio}</span>
              </div>
            </div>
          </div>

          {/* Catalyst Details */}
          <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-xs text-slate-300">
            <span className="text-emerald-400 font-bold block mb-1 font-sans flex items-center gap-1">
              <TrendingUp size={12} />
              Primary Momentum Catalyst
            </span>
            <p className="leading-relaxed font-sans text-slate-400 text-[11px]">
              {analysis.catalystDetails}
            </p>
          </div>

          {/* Action Footer */}
          <button
            onClick={triggerAnalysis}
            className="mt-auto py-2 border border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-900/60 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            Re-run Diagnostic Analysis
          </button>
        </div>
      )}
    </div>
  );
}
