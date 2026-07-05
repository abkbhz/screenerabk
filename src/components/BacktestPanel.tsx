import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from "recharts";
import { BacktestResult } from "../types";
import { apiUrl } from "../api";
import { History, Loader2, Info, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  ticker: string;
}

export default function BacktestPanel({ ticker }: Props) {
  const [data, setData] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/stocks/backtest?ticker=${encodeURIComponent(ticker)}`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Backtest failed"))))
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker]);

  return (
    <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4.5 backdrop-blur-md">
      <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/60">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <History size={14} className="text-emerald-400" />
          10-Year Strategy Backtest
        </h3>
        {data && (
          <span className="text-[9px] font-mono text-slate-500">
            {data.stats.years}y · {data.isLive ? "LIVE DATA" : "SIMULATED"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="h-[320px] flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="animate-spin text-emerald-400 mb-2" size={22} />
          <p className="text-xs font-mono">Simulating {ticker.replace(/\.NS$/, "")} over 10 years…</p>
        </div>
      ) : error || !data ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-slate-500">
          Could not run backtest. {error}
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4">
            <Stat label="Strategy return" value={`${data.stats.totalReturnPct >= 0 ? "+" : ""}${data.stats.totalReturnPct}%`} tone={data.stats.totalReturnPct >= 0 ? "pos" : "neg"} />
            <Stat label="Buy & hold" value={`${data.stats.buyHoldReturnPct >= 0 ? "+" : ""}${data.stats.buyHoldReturnPct}%`} tone={data.stats.buyHoldReturnPct >= 0 ? "pos" : "neg"} />
            <Stat label="Strategy CAGR" value={`${data.stats.cagr}%`} tone={data.stats.cagr >= 0 ? "pos" : "neg"} />
            <Stat label="Trades" value={`${data.stats.trades}`} />
            <Stat label="Win rate" value={`${data.stats.winRatePct}%`} tone={data.stats.winRatePct >= 50 ? "pos" : "neg"} />
            <Stat label="Max drawdown" value={`-${data.stats.maxDrawdownPct}%`} tone="neg" />
          </div>

          {/* Equity curve: strategy vs buy & hold (₹100 start) */}
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.equitySeries} margin={{ top: 8, right: 6, left: -14, bottom: 0 }}>
                <defs>
                  <linearGradient id="btStrategy" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="date" stroke="#4b5563" fontSize={9} minTickGap={40} />
                <YAxis stroke="#4b5563" fontSize={9} domain={["auto", "auto"]} tickFormatter={(v) => `₹${v}`} />
                <Tooltip
                  contentStyle={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }}
                  formatter={(val: any, name: any) => [`₹${Number(val).toLocaleString("en-IN")}`, name === "strategy" ? "Screener strategy" : "Buy & hold"]}
                />
                <Legend wrapperStyle={{ fontSize: 10 }} formatter={(v) => (v === "strategy" ? "Screener strategy" : "Buy & hold")} />
                <Area type="monotone" dataKey="buyHold" stroke="#64748b" strokeWidth={1.5} fill="none" strokeDasharray="4 3" dot={false} />
                <Area type="monotone" dataKey="strategy" stroke="#10b981" strokeWidth={2.5} fill="url(#btStrategy)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[9px] text-slate-600 font-mono text-center mt-1">
            Both lines start at ₹100 · strategy follows the screener's entry/exit rules
          </p>

          {/* Recent trades */}
          {data.trades.length > 0 && (
            <div className="mt-3 border-t border-slate-800/60 pt-3">
              <span className="text-[10px] font-mono text-slate-500 uppercase block mb-2">Last {Math.min(5, data.trades.length)} simulated trades</span>
              <div className="flex flex-col gap-1">
                {data.trades.slice(-5).reverse().map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] font-mono bg-[#0c101b]/60 border border-slate-800/50 rounded-lg px-2.5 py-1.5">
                    <span className="text-slate-400">{t.entryDate} → {t.open ? "open" : t.exitDate}</span>
                    <span className={`font-bold flex items-center gap-1 ${t.returnPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {t.returnPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {t.returnPct >= 0 ? "+" : ""}{t.returnPct}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-slate-500 bg-slate-900/40 border border-slate-800/60 rounded-lg p-2.5">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              <span className="text-slate-400 font-semibold">Educational backtest.</span>{" "}
              Past performance is simulated on historical weekly data and does not predict future results. No costs, slippage, or taxes modelled.
            </span>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-slate-100";
  return (
    <div className="bg-[#0c101b]/70 border border-slate-800/60 rounded-xl p-2.5">
      <span className="text-[9px] font-mono text-slate-500 uppercase block leading-tight">{label}</span>
      <span className={`text-sm font-bold font-mono block mt-1 ${color}`}>{value}</span>
    </div>
  );
}
