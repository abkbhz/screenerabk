import { useEffect, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea, Brush
} from "recharts";
import { StockPoint } from "../types";
import { apiUrl } from "../api";
import { Activity, TrendingUp, BarChart3, Loader2 } from "lucide-react";

interface StockChartProps {
  ticker: string;
  initialHistory?: StockPoint[]; // seed for instant first paint (weekly detail)
}

const TIMEFRAMES = ["1D", "5D", "1M", "6M", "1Y", "5Y", "10Y"] as const;
type TF = typeof TIMEFRAMES[number];

export default function StockChart({ ticker, initialHistory }: StockChartProps) {
  const [activeTab, setActiveTab] = useState<"price" | "rsi" | "volume">("price");
  const [tf, setTf] = useState<TF>("1Y");
  const [points, setPoints] = useState<StockPoint[]>(initialHistory || []);
  const [resLabel, setResLabel] = useState<string>("Daily");
  const [loading, setLoading] = useState(false);
  const [isLive, setIsLive] = useState(false);

  // Seed with the weekly detail history whenever a new stock is selected,
  // so the chart is never blank while the timeframe data loads.
  useEffect(() => {
    if (initialHistory && initialHistory.length) setPoints(initialHistory);
  }, [ticker, initialHistory]);

  // Fetch the requested resolution.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(apiUrl(`/api/stocks/history?ticker=${encodeURIComponent(ticker)}&tf=${tf}`))
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("history failed"))))
      .then((d) => {
        if (cancelled) return;
        if (Array.isArray(d.points) && d.points.length) {
          setPoints(d.points);
          setResLabel(d.label || "");
          setIsLive(!!d.isLive);
        }
      })
      .catch(() => { /* keep whatever we already show */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [ticker, tf]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#0b0f19] border border-slate-800 p-3 rounded-lg shadow-2xl font-mono text-xs text-slate-300">
          <p className="text-slate-400 font-semibold mb-1">{label}</p>
          {payload.map((item: any, idx: number) => (
            <div key={idx} className="flex justify-between gap-4 py-0.5">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}:
              </span>
              <span className="font-bold text-slate-100">
                {item.name.includes("Volume") ? Number(item.value).toLocaleString() : `₹${parseFloat(item.value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
      {/* Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs font-mono rounded border border-emerald-500/10">
              {ticker.replace(/\.NS$/, "")}
            </span>
            Technical Chart
            <span className="text-[10px] font-mono text-slate-500 border border-slate-800 rounded px-1.5 py-0.5">{resLabel}</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Zoomable price + indicators · resolution adapts to timeframe</p>
        </div>

        {/* Facet toggles */}
        <div className="flex bg-[#0f172a] p-1 rounded-lg border border-slate-800 self-stretch sm:self-auto">
          {([["price", TrendingUp, "Price"], ["rsi", Activity, "RSI"], ["volume", BarChart3, "Volume"]] as const).map(([key, Icon, text]) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeTab === key ? "bg-slate-800 text-slate-100 border-b-2 border-emerald-500" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={13} />
              {text}
            </button>
          ))}
        </div>
      </div>

      {/* Timeframe / resolution selector */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {TIMEFRAMES.map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
              tf === t ? "bg-emerald-600 text-white" : "bg-[#0c101b] border border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
          >
            {t}
          </button>
        ))}
        {isLive && (
          <span className="ml-1 text-[9px] font-mono text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> LIVE
          </span>
        )}
        {loading && <Loader2 size={12} className="animate-spin text-emerald-400 ml-1" />}
      </div>

      {/* Chart area */}
      <div className="h-[320px] w-full relative">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#111827]/40 backdrop-blur-[1px] rounded-lg">
            <Loader2 className="animate-spin text-emerald-400" size={22} />
          </div>
        )}
        {points.length === 0 ? (
          <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">Loading chart…</div>
        ) : activeTab === "price" ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" stroke="#4b5563" fontSize={10} minTickGap={40} interval="preserveStartEnd" />
              <YAxis stroke="#4b5563" fontSize={10} domain={['auto', 'auto']} tickFormatter={(val) => `₹${val}`} />
              <Tooltip content={<CustomTooltip />} />
              <Area name="Close Price" type="monotone" dataKey="close" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorClose)" />
              <Line name="20 EMA" type="monotone" dataKey="ema20" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              <Line name="50 EMA" type="monotone" dataKey="ema50" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
              <Line name="200 EMA" type="monotone" dataKey="ema200" stroke="#a855f7" strokeWidth={1.5} dot={false} />
              <Brush dataKey="date" height={22} stroke="#334155" fill="#0c101b" travellerWidth={8} tickFormatter={() => ""} />
            </AreaChart>
          </ResponsiveContainer>
        ) : activeTab === "rsi" ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" stroke="#4b5563" fontSize={10} minTickGap={40} interval="preserveStartEnd" />
              <YAxis stroke="#4b5563" fontSize={10} domain={[20, 80]} />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceArea {...({ y1: 55, y2: 63, fill: "#10b981", fillOpacity: 0.08 } as any)} />
              <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Overbought (70)', fill: '#f43f5e', position: 'top', fontSize: 8 }} />
              <ReferenceLine y={30} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'Oversold (30)', fill: '#3b82f6', position: 'bottom', fontSize: 8 }} />
              <Line name="RSI (14)" type="monotone" dataKey="rsi" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={points} margin={{ top: 10, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" stroke="#4b5563" fontSize={10} minTickGap={40} interval="preserveStartEnd" />
              <YAxis stroke="#4b5563" fontSize={10} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar name="Volume" dataKey="volume" fill="#4b5563" fillOpacity={0.4} radius={[2, 2, 0, 0]} />
              <Line name="Volume SMA (20)" type="monotone" dataKey="volumeSma20" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 mt-4 pt-4 border-t border-slate-800/60 text-[10px] font-mono">
        {activeTab === "price" && (
          <>
            <span className="flex items-center gap-1 text-emerald-400"><span className="w-2.5 h-0.5 bg-[#10b981]" /> Price</span>
            <span className="flex items-center gap-1 text-amber-500"><span className="w-2.5 h-0.5 bg-[#f59e0b]" /> 20 EMA</span>
            <span className="flex items-center gap-1 text-blue-500"><span className="w-2.5 h-0.5 bg-[#3b82f6]" /> 50 EMA</span>
            <span className="flex items-center gap-1 text-purple-500"><span className="w-2.5 h-0.5 bg-[#a855f7]" /> 200 EMA</span>
            <span className="text-slate-600">Drag the bar below the chart to zoom</span>
          </>
        )}
        {activeTab === "rsi" && (
          <>
            <span className="flex items-center gap-1 text-emerald-400"><span className="w-2.5 h-2 bg-[#10b981]/25" /> Momentum zone (55-63)</span>
            <span className="flex items-center gap-1 text-slate-400"><span className="w-2.5 h-0.5 bg-[#10b981]" /> RSI Line</span>
          </>
        )}
        {activeTab === "volume" && (
          <>
            <span className="flex items-center gap-1 text-slate-400"><span className="w-2.5 h-2 bg-[#4b5563]/40" /> Volume</span>
            <span className="flex items-center gap-1 text-amber-500"><span className="w-2.5 h-0.5 bg-[#f59e0b]" /> Volume SMA (20)</span>
          </>
        )}
      </div>
    </div>
  );
}
