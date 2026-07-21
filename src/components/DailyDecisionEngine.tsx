import { useState } from "react";
import { StockDetails, DailyDecision, DailyDecisionResponse, MarketTrend } from "../types";
import { apiUrl } from "../api";
import {
  Zap, RotateCw, Check, X, Target, ShieldAlert, Clock, Scale,
  ArrowUpRight, TrendingUp, TrendingDown, Minus, Gauge, ChevronDown, ChevronUp,
} from "lucide-react";

interface Props {
  // The weekly-matched, live watchlist (stage-1 output) to run the daily stage on.
  weeklyMatches: StockDetails[];
  hasActiveFilters: boolean;
  onSelectTicker?: (ticker: string) => void;
}

const fmt = (n: number) =>
  Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const classStyles: Record<string, { chip: string; ring: string; label: string }> = {
  BUY: {
    chip: "bg-emerald-500/15 text-emerald-400 border border-emerald-400/30",
    ring: "border-emerald-500/40 shadow-lg shadow-emerald-500/5",
    label: "text-emerald-400",
  },
  WAIT: {
    chip: "bg-amber-500/15 text-amber-400 border border-amber-400/30",
    ring: "border-amber-500/25",
    label: "text-amber-400",
  },
  AVOID: {
    chip: "bg-rose-500/15 text-rose-400 border border-rose-400/30",
    ring: "border-rose-500/20",
    label: "text-rose-400",
  },
};

function MarketTrendBadge({ market }: { market: MarketTrend }) {
  const map = {
    Bullish: { icon: <TrendingUp size={12} />, cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
    Neutral: { icon: <Minus size={12} />, cls: "bg-slate-700/30 text-slate-300 border-slate-600/40" },
    Bearish: { icon: <TrendingDown size={12} />, cls: "bg-rose-500/10 text-rose-400 border-rose-500/25" },
  }[market.trend];
  return (
    <span
      title={market.isLive ? `Nifty ₹${fmt(market.niftyClose)} vs 20 EMA ₹${fmt(market.niftyEma20)}` : "Market data unavailable"}
      className={`px-2 py-0.5 text-[9px] font-mono font-extrabold uppercase tracking-widest rounded-md border flex items-center gap-1 ${map.cls}`}
    >
      {map.icon}
      MARKET: {market.trend}
    </span>
  );
}

function CheckPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-mono flex items-center gap-1 border ${
        ok
          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/15"
          : "bg-slate-800/60 text-slate-500 border-slate-700/40"
      }`}
    >
      {ok ? <Check size={9} /> : <X size={9} />}
      {label}
    </span>
  );
}

function DecisionCard({ d, onSelect }: { d: DailyDecision; onSelect?: (t: string) => void }) {
  const [open, setOpen] = useState(d.classification === "BUY");
  const s = classStyles[d.classification];
  return (
    <div className={`rounded-xl border bg-[#0c101b]/60 p-3 transition-all ${s.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => onSelect?.(d.ticker)} className="text-left min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-bold font-mono text-slate-200 tracking-wide">
              {d.ticker.replace(/\.NS$/, "")}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider font-mono ${s.chip}`}>
              {d.classification}
            </span>
            {!d.isLive && (
              <span className="px-1 py-0.5 rounded text-[7px] font-mono text-slate-500 border border-slate-700/50">SIM</span>
            )}
          </div>
          <span className="text-[10px] text-slate-500 block truncate max-w-[150px] hover:text-slate-300">
            {d.name}
          </span>
        </button>
        <div className="text-right font-mono shrink-0">
          <span className="text-xs font-bold text-slate-200 block">₹{fmt(d.metrics.close)}</span>
          <span className="text-[9px] text-slate-500 flex items-center justify-end gap-1">
            <Gauge size={9} /> RSI {d.metrics.rsi}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-slate-400 mt-1.5 leading-snug">{d.reason}</p>

      {/* Trade plan (BUY only) */}
      {d.trade && (
        <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5">
            <ArrowUpRight size={13} className="text-emerald-400 shrink-0" />
            <div>
              <span className="text-[8px] uppercase text-slate-500 font-mono block">Entry</span>
              <span className="text-xs font-bold font-mono text-slate-200">₹{fmt(d.trade.entry)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Target size={13} className="text-teal-400 shrink-0" />
            <div>
              <span className="text-[8px] uppercase text-slate-500 font-mono block">Target (+5%)</span>
              <span className="text-xs font-bold font-mono text-teal-400">₹{fmt(d.trade.target)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={13} className="text-rose-400 shrink-0" />
            <div>
              <span className="text-[8px] uppercase text-slate-500 font-mono block">Stop Loss</span>
              <span className="text-xs font-bold font-mono text-rose-400">₹{fmt(d.trade.stopLoss)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Scale size={13} className="text-blue-400 shrink-0" />
            <div>
              <span className="text-[8px] uppercase text-slate-500 font-mono block">Risk : Reward</span>
              <span className="text-xs font-bold font-mono text-blue-400">{d.trade.riskReward}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 col-span-2">
            <Clock size={13} className="text-slate-400 shrink-0" />
            <span className="text-[10px] font-mono text-slate-400">
              Expected holding: <span className="text-slate-200 font-bold">~{d.trade.holdingDays} trading days</span>
            </span>
          </div>
        </div>
      )}

      {/* Expandable daily-check breakdown */}
      <button
        onClick={() => setOpen(o => !o)}
        className="mt-2 flex items-center gap-1 text-[9px] font-mono text-slate-500 hover:text-slate-300"
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        Daily checks
      </button>
      {open && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          <CheckPill ok={d.checks.closeAbove20Ema} label="Close > 20 EMA" />
          <CheckPill ok={d.checks.rsiInZone} label="RSI 55–70" />
          <CheckPill ok={d.checks.volumeSpike} label="Vol > 1.5×" />
          <CheckPill ok={d.checks.notOverextended} label={`Ext ${d.metrics.extensionPct}%`} />
          <CheckPill
            ok={d.checks.hasUpsideToResistance}
            label={d.metrics.upsidePct === null ? "Open upside" : `Upside ${d.metrics.upsidePct}%`}
          />
        </div>
      )}
    </div>
  );
}

export default function DailyDecisionEngine({ weeklyMatches, hasActiveFilters, onSelectTicker }: Props) {
  const [data, setData] = useState<DailyDecisionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runScan = async () => {
    const tickers = weeklyMatches.map(s => s.ticker);
    if (tickers.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/stocks/daily-decision"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Daily scan failed.");
      }
      setData(await res.json());
    } catch (err: any) {
      setError(err.message || "Daily Decision Engine failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4.5 backdrop-blur-md">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3 pb-2 border-b border-slate-800/60">
        <h2 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
          <Zap size={13} className="text-amber-400" />
          Daily Decision Engine
          <span className="text-[9px] font-mono text-slate-500 normal-case tracking-normal">Stage 2</span>
        </h2>
        <div className="flex items-center gap-2">
          {data?.market && <MarketTrendBadge market={data.market} />}
          <button
            onClick={runScan}
            disabled={loading || weeklyMatches.length === 0}
            className="px-3 py-1.5 bg-amber-600/90 hover:bg-amber-500 text-slate-950 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <RotateCw size={12} className="animate-spin" /> : <Zap size={12} />}
            {loading ? "Scanning…" : `Run Daily Scan (${weeklyMatches.length})`}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-slate-500 leading-relaxed mb-3">
        Runs daily-timeframe checks (20 EMA, RSI 55–70, 1.5× volume, extension, resistance upside) on the{" "}
        <span className="text-slate-300 font-semibold">{weeklyMatches.length}</span> stock(s) that passed your weekly
        scan, then classifies each as BUY / WAIT / AVOID. The weekly filters are untouched.
      </p>

      {error && (
        <div className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-2.5 py-2 mb-3">
          {error}
        </div>
      )}

      {!hasActiveFilters && !data && (
        <div className="text-center py-6 border border-dashed border-slate-800 rounded-xl bg-slate-900/10">
          <p className="text-[11px] text-slate-400 font-semibold">No weekly filters active</p>
          <p className="text-[10px] text-slate-600 mt-0.5">
            Enable weekly momentum toggles to build a watchlist, then run the daily stage.
          </p>
        </div>
      )}

      {data && (
        <>
          {/* Summary funnel */}
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              { k: "total", label: "Weekly", val: data.summary.total, cls: "text-slate-200" },
              { k: "buy", label: "BUY", val: data.summary.buy, cls: "text-emerald-400" },
              { k: "wait", label: "WAIT", val: data.summary.wait, cls: "text-amber-400" },
              { k: "avoid", label: "AVOID", val: data.summary.avoid, cls: "text-rose-400" },
            ].map(x => (
              <div key={x.k} className="bg-[#0c101b]/60 border border-slate-800/60 rounded-lg py-2 text-center">
                <span className={`block text-lg font-bold font-mono ${x.cls}`}>{x.val}</span>
                <span className="text-[8px] uppercase font-mono text-slate-500 tracking-wider">{x.label}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
            {data.results.map(d => (
              <DecisionCard key={d.ticker} d={d} onSelect={onSelectTicker} />
            ))}
          </div>
          <p className="text-[9px] text-slate-600 font-mono mt-3 leading-relaxed">
            Educational technical output — not investment advice. Market trend is informational; a Bearish Nifty does not
            by itself reject a stock.
          </p>
        </>
      )}
    </div>
  );
}
