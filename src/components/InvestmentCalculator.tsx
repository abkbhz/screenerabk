import { useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine
} from "recharts";
import { StockDetails } from "../types";
import { Calculator, TrendingUp, Info, IndianRupee } from "lucide-react";

interface Props {
  stock: StockDetails;
}

const DURATIONS = [
  { label: "1 Week", days: 7 },
  { label: "1 Month", days: 30 },
  { label: "3 Months", days: 90 },
  { label: "6 Months", days: 180 },
  { label: "1 Year", days: 365 },
];

const inr = (v: number) =>
  `₹${v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export default function InvestmentCalculator({ stock }: Props) {
  const [amount, setAmount] = useState<number>(5000);
  const [days, setDays] = useState<number>(7);

  const price = stock.price || 1;
  const proj = stock.projections;

  const result = useMemo(() => {
    const shares = Math.floor(amount / price);
    const invested = shares * price;
    const leftover = amount - invested;

    // Expected return compounds the historical weekly mean over the horizon;
    // the ±band widens with √time (a rough 1σ historical volatility cone).
    const weeks = days / 7;
    const mean = proj?.weeklyMeanReturn ?? 0;
    const std = proj?.weeklyStdReturn ?? 0;
    const cumReturn = Math.pow(1 + mean, weeks) - 1;
    const band = std * Math.sqrt(weeks);

    const expectedPct = cumReturn * 100;
    const lowPct = (cumReturn - band) * 100;
    const highPct = (cumReturn + band) * 100;

    const projectedValue = invested * (1 + cumReturn);
    const profit = projectedValue - invested;
    const lowValue = Math.max(0, invested * (1 + cumReturn - band));
    const highValue = invested * (1 + cumReturn + band);

    // Build the projection cone (day 0 -> horizon).
    const steps = Math.min(Math.max(Math.round(days), 8), 60);
    const series = Array.from({ length: steps + 1 }, (_, i) => {
      const t = (days * i) / steps; // days elapsed
      const w = t / 7;
      const cr = Math.pow(1 + mean, w) - 1;
      const b = std * Math.sqrt(w);
      const mid = invested * (1 + cr);
      const lo = Math.max(0, invested * (1 + cr - b));
      const hi = invested * (1 + cr + b);
      return {
        day: Math.round(t),
        expected: parseFloat(mid.toFixed(0)),
        band: [parseFloat(lo.toFixed(0)), parseFloat(hi.toFixed(0))] as [number, number],
      };
    });

    return { shares, invested, leftover, expectedPct, lowPct, highPct, projectedValue, profit, lowValue, highValue, series };
  }, [amount, days, price, proj]);

  const positive = result.profit >= 0;

  return (
    <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4.5 backdrop-blur-md">
      <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4 pb-2 border-b border-slate-800/60 flex items-center gap-1.5">
        <Calculator size={14} className="text-emerald-400" />
        Investment Projection Calculator
      </h3>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div>
          <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Amount to invest</label>
          <div className="relative">
            <IndianRupee size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
            <input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value)))}
              className="w-full pl-8 pr-3 py-2 bg-[#0c101b] border border-slate-800 focus:border-emerald-500/50 rounded-xl text-sm text-slate-100 outline-none font-mono"
            />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-mono text-slate-500 uppercase block mb-1">Holding duration</label>
          <div className="flex flex-wrap gap-1">
            {DURATIONS.map((d) => (
              <button
                key={d.days}
                onClick={() => setDays(d.days)}
                className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                  days === d.days
                    ? "bg-emerald-600 text-white"
                    : "bg-[#0c101b] border border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Result tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
        <Tile label="Shares you'd get" value={result.shares.toLocaleString("en-IN")} sub={`@ ₹${price.toFixed(2)}`} />
        <Tile label="Invested" value={inr(result.invested)} sub={`₹${result.leftover.toFixed(0)} left`} />
        <Tile
          label="Expected return"
          value={`${result.expectedPct >= 0 ? "+" : ""}${result.expectedPct.toFixed(2)}%`}
          sub={`range ${result.lowPct.toFixed(1)}% … ${result.highPct.toFixed(1)}%`}
          tone={result.expectedPct >= 0 ? "pos" : "neg"}
        />
        <Tile
          label="Projected profit"
          value={`${positive ? "+" : ""}${inr(result.profit)}`}
          sub={`→ ${inr(result.projectedValue)}`}
          tone={positive ? "pos" : "neg"}
        />
      </div>

      {/* Projection cone chart */}
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={result.series} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="calcBand" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity={0.18} />
                <stop offset="100%" stopColor={positive ? "#10b981" : "#f43f5e"} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="day" stroke="#4b5563" fontSize={9} tickFormatter={(d) => `${d}d`} />
            <YAxis stroke="#4b5563" fontSize={9} domain={["auto", "auto"]} tickFormatter={(v) => `₹${(v / 1000).toFixed(1)}k`} />
            <Tooltip
              contentStyle={{ background: "#0b0f19", border: "1px solid #1f2937", borderRadius: 8, fontSize: 11 }}
              formatter={(val: any, name: any) => {
                if (name === "band") return [`₹${val[0].toLocaleString("en-IN")} … ₹${val[1].toLocaleString("en-IN")}`, "Likely range"];
                return [`₹${Number(val).toLocaleString("en-IN")}`, "Expected value"];
              }}
              labelFormatter={(d) => `Day ${d}`}
            />
            <ReferenceLine y={result.invested} stroke="#64748b" strokeDasharray="4 4" />
            <Area type="monotone" dataKey="band" stroke="none" fill="url(#calcBand)" />
            <Line type="monotone" dataKey="expected" stroke={positive ? "#10b981" : "#f43f5e"} strokeWidth={2.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Signal-aware note + disclaimer */}
      <div className="mt-3 flex items-start gap-2 text-[10px] leading-relaxed text-slate-500 bg-slate-900/40 border border-slate-800/60 rounded-lg p-2.5">
        <Info size={13} className="text-slate-500 shrink-0 mt-0.5" />
        <span>
          <span className="text-slate-400 font-semibold">Estimate only — not financial advice.</span>{" "}
          Projected from this stock's historical weekly trend (mean {((proj?.weeklyMeanReturn ?? 0) * 100).toFixed(2)}%/wk,
          volatility {((proj?.weeklyStdReturn ?? 0) * 100).toFixed(1)}%). Actual returns can differ significantly; the shaded band shows a rough ±1σ range, not a guarantee.
          {stock.entryRecommendation && (
            <span className="block mt-1 text-slate-400">
              <TrendingUp size={10} className="inline mr-1 text-emerald-400" />
              Current screener signal: <span className="font-mono font-bold">{stock.entryRecommendation}</span>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  const color = tone === "pos" ? "text-emerald-400" : tone === "neg" ? "text-rose-400" : "text-slate-100";
  return (
    <div className="bg-[#0c101b]/70 border border-slate-800/60 rounded-xl p-2.5">
      <span className="text-[9px] font-mono text-slate-500 uppercase block leading-tight">{label}</span>
      <span className={`text-sm font-bold font-mono block mt-1 ${color}`}>{value}</span>
      {sub && <span className="text-[9px] text-slate-600 font-mono block truncate">{sub}</span>}
    </div>
  );
}
