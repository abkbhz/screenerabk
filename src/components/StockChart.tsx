import { useState } from "react";
import { 
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine, ReferenceArea 
} from "recharts";
import { StockPoint } from "../types";
import { Activity, TrendingUp, BarChart3, Maximize2 } from "lucide-react";

interface StockChartProps {
  history: StockPoint[];
  ticker: string;
}

export default function StockChart({ history, ticker }: StockChartProps) {
  const [activeTab, setActiveTab] = useState<"price" | "rsi" | "volume">("price");

  // Customized Tooltip component
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
                {item.name.includes("Volume") ? item.value.toLocaleString() : `₹${parseFloat(item.value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 text-xs font-mono rounded border border-emerald-500/10">
              {ticker}
            </span>
            Weekly Technical Chart
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Historical 50-week technical indicators overlay</p>
        </div>

        {/* Chart FACET toggles */}
        <div className="flex bg-[#0f172a] p-1 rounded-lg border border-slate-800 self-stretch sm:self-auto">
          <button
            onClick={() => setActiveTab("price")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              activeTab === "price" 
                ? "bg-slate-800 text-slate-100 border-b-2 border-emerald-500" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <TrendingUp size={13} />
            Price & EMAs
          </button>
          <button
            onClick={() => setActiveTab("rsi")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              activeTab === "rsi" 
                ? "bg-slate-800 text-slate-100 border-b-2 border-emerald-500" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity size={13} />
            RSI Oscillator
          </button>
          <button
            onClick={() => setActiveTab("volume")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all duration-200 ${
              activeTab === "volume" 
                ? "bg-slate-800 text-slate-100 border-b-2 border-emerald-500" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <BarChart3 size={13} />
            Volume SMA
          </button>
        </div>
      </div>

      {/* Primary Chart Area */}
      <div className="h-[300px] w-full relative">
        {activeTab === "price" && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="colorClose" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.01}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" stroke="#4b5563" fontSize={10} fontClassName="font-mono" />
              <YAxis 
                stroke="#4b5563" 
                fontSize={10} 
                fontClassName="font-mono"
                domain={['auto', 'auto']}
                tickFormatter={(val) => `₹${val}`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area name="Close Price" type="monotone" dataKey="close" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#colorClose)" />
              <Line name="20W EMA" type="monotone" dataKey="ema20" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
              <Line name="50W EMA" type="monotone" dataKey="ema50" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
              <Line name="200W EMA" type="monotone" dataKey="ema200" stroke="#a855f7" strokeWidth={1.5} dot={false} />
              <Line name="8W High" type="monotone" dataKey="high8w" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}

        {activeTab === "rsi" && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ top: 10, right: 5, left: -25, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" stroke="#4b5563" fontSize={10} fontClassName="font-mono" />
              <YAxis 
                stroke="#4b5563" 
                fontSize={10} 
                fontClassName="font-mono"
                domain={[20, 80]}
              />
              <Tooltip content={<CustomTooltip />} />
              {/* Golden User Momentum zone shading: 55 to 63 */}
              <ReferenceArea {...({ y1: 55, y2: 63, fill: "#10b981", fillOpacity: 0.08, label: "RSI Target Zone (55-63)" } as any)} />
              <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="3 3" label={{ value: 'Overbought (70)', fill: '#f43f5e', position: 'top', fontSize: 8 }} />
              <ReferenceLine y={30} stroke="#3b82f6" strokeDasharray="3 3" label={{ value: 'Oversold (30)', fill: '#3b82f6', position: 'bottom', fontSize: 8 }} />
              <Line name="Weekly RSI (14)" type="monotone" dataKey="rsi" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeTab === "volume" && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 10, right: 5, left: -15, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" stroke="#4b5563" fontSize={10} fontClassName="font-mono" />
              <YAxis 
                stroke="#4b5563" 
                fontSize={10} 
                fontClassName="font-mono"
                tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar name="Volume" dataKey="volume" fill="#4b5563" fillOpacity={0.4} radius={[2, 2, 0, 0]} />
              <Line name="Volume SMA (20)" type="monotone" dataKey="volumeSma20" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Interactive Chart Legend */}
      <div className="flex flex-wrap justify-center items-center gap-x-5 gap-y-2 mt-4 pt-4 border-t border-slate-800/60 text-[10px] font-mono">
        {activeTab === "price" && (
          <>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2.5 h-0.5 bg-[#10b981]" /> Price
            </span>
            <span className="flex items-center gap-1 text-amber-500">
              <span className="w-2.5 h-0.5 bg-[#f59e0b]" /> 20W EMA (Short Trend)
            </span>
            <span className="flex items-center gap-1 text-blue-500">
              <span className="w-2.5 h-0.5 bg-[#3b82f6]" /> 50W EMA (Medium Trend)
            </span>
            <span className="flex items-center gap-1 text-purple-500">
              <span className="w-2.5 h-0.5 bg-[#a855f7]" /> 200W EMA (Long Anchor)
            </span>
            <span className="flex items-center gap-1 text-rose-500">
              <span className="w-2.5 h-0.5 bg-[#ef4444] border-t border-dashed" /> 8W High Breakout Target
            </span>
          </>
        )}
        {activeTab === "rsi" && (
          <>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2.5 h-2 bg-[#10b981]/25" /> Momentum zone (55 - 63)
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-2.5 h-0.5 bg-[#10b981]" /> Weekly RSI Line
            </span>
          </>
        )}
        {activeTab === "volume" && (
          <>
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-2.5 h-2 bg-[#4b5563]/40" /> Actual Volume
            </span>
            <span className="flex items-center gap-1 text-amber-500">
              <span className="w-2.5 h-0.5 bg-[#f59e0b]" /> 20W Volume SMA (Baseline)
            </span>
          </>
        )}
      </div>
    </div>
  );
}
