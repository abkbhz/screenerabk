import { useState, useEffect, useMemo, FormEvent } from "react";
import { StockDetails, FilterConfig } from "./types";
import MetricCard from "./components/MetricCard";
import StockChart from "./components/StockChart";
import AiAnalysisPanel from "./components/AiAnalysisPanel";
import InvestmentCalculator from "./components/InvestmentCalculator";
import BacktestPanel from "./components/BacktestPanel";
import DailyDecisionEngine from "./components/DailyDecisionEngine";
import { apiUrl } from "./api";
import { 
  TrendingUp, TrendingDown, Search, Plus, RotateCw, 
  Filter, Sparkles, Activity, Check, Volume2, 
  ArrowUpRight, AlertTriangle, ShieldCheck 
} from "lucide-react";

// Indian-locale price formatter: 1411.4000244 -> "1,411.40"
const fmtPrice = (n: number) =>
  Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Cap how many stock cards render at once. With ~2000 stocks, rendering them
// all mounts tens of thousands of DOM nodes and hangs the browser. The full
// universe is still searched/filtered — only the visible list is capped.
const LIST_LIMIT = 80;

// Weekly & Daily screener toggles (order preserved). `key` maps to filtersMatched.
const FILTER_DEFS: { key: keyof FilterConfig; title: string; desc: string }[] = [
  { key: "closeAbove100", title: "Close > ₹100", desc: "Filter out low-priced equities" },
  { key: "closeAbove20wEma", title: "Close > 20W EMA", desc: "Short-term trend support" },
  { key: "closeAbove50wEma", title: "Close > 50W EMA", desc: "Medium-term trend anchor" },
  { key: "closeAbove200wEma", title: "Close > 200W EMA", desc: "Major long-term safety support" },
  { key: "rsiBetween55And70", title: "Weekly RSI 55 - 70", desc: "Bullish momentum zone (55 - 70)" },
  { key: "volumeAbove2Sma20", title: "Weekly Vol > 2.0x SMA20", desc: "Heavy weekly volume breakout" },
  { key: "dailyVolAbove1_5Sma20", title: "Daily Vol > 1.5x SMA20", desc: "Daily volume surge (>1.5x average)" },
  { key: "closeAbove8wHigh", title: "Close > Prev 8W High", desc: "8-week breakout confirmation" },
];

export default function App() {
  const [stocks, setStocks] = useState<StockDetails[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockDetails | null>(null);
  const [searchTicker, setSearchTicker] = useState("");
  const [listSearchQuery, setListSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ symbol: string; name: string; exchange: string }[]>([]);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [searchingMarket, setSearchingMarket] = useState(false);
  const [loading, setLoading] = useState(true);
  const [addingStock, setAddingStock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchingLiveDetail, setFetchingLiveDetail] = useState(false);

  // Filter selections
  const [filters, setFilters] = useState<FilterConfig>({
    closeAbove100: false,
    closeAbove20wEma: false,
    closeAbove50wEma: false,
    closeAbove200wEma: false,
    rsiBetween55And70: false,
    volumeAbove2Sma20: false,
    dailyVolAbove1_5Sma20: false,
    closeAbove8wHigh: false,
  });

  // Initial fetch
  const fetchStocks = async (isPoll = false) => {
    if (!isPoll) setLoading(true);
    else setRefreshing(true);
    
    try {
      const res = await fetch(apiUrl("/api/stocks"));
      if (!res.ok) throw new Error("Failed to load screener stocks");
      const data = await res.json();
      
      setStocks(data.stocks || []);

      // Auto-select the first stock only when nothing is selected yet.
      // Never overwrite an already-selected stock with the list-shaped entry
      // (that would strip its chart history + projections and blank the panels).
      if (data.stocks && data.stocks.length > 0) {
        setSelectedStock(prev => prev ? prev : data.stocks[0]);
      }
      setError(null);
    } catch (err: any) {
      setError(err.message || "Failed to sync stock tracker.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStocks();

    // Poll stocks every 60 seconds to refresh prices without hammering the CPU.
    const pollInterval = setInterval(() => {
      fetchStocks(true);
    }, 60000);

    return () => clearInterval(pollInterval);
  }, []);

  // Live market search handler with debouncing across 2,800+ companies
  useEffect(() => {
    if (!searchTicker || searchTicker.trim().length === 0) {
      setSearchResults([]);
      setShowSearchDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchingMarket(true);
      try {
        const res = await fetch(apiUrl(`/api/stocks/search?q=${encodeURIComponent(searchTicker.trim())}`));
        if (res.ok) {
          const data = await res.json();
          setSearchResults(data.results || []);
          setShowSearchDropdown(true);
        }
      } catch (err) {
        console.warn("Market search error:", err);
      } finally {
        setSearchingMarket(false);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [searchTicker]);

  const handleSelectSearchResult = async (symbol: string, exchange: string) => {
    setShowSearchDropdown(false);
    setSearchTicker("");
    const targetTicker = exchange === 'BSE' && !symbol.includes('.') ? `${symbol}.BO` : symbol;
    
    // Check if ticker already in loaded stocks list
    const found = stocks.find(s => 
      s.ticker === targetTicker || 
      s.ticker.replace(/\.NS$/, '').replace(/\.BO$/, '') === symbol.toUpperCase()
    );
    if (found) {
      setSelectedStock(found);
    } else {
      setAddingStock(true);
      setError(null);
      try {
        const res = await fetch(apiUrl("/api/stocks/add"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker: targetTicker })
        });
        if (res.ok) {
          const data = await res.json();
          setStocks(prev => [data.stock, ...prev.filter(s => s.ticker !== data.stock.ticker)]);
          setSelectedStock(data.stock);
        } else {
          loadDetail(targetTicker);
        }
      } catch (err: any) {
        setError(err.message || `Could not load asset ${symbol}`);
      } finally {
        setAddingStock(false);
      }
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Load the full live detail (history + projections) for the selected stock.
  // The list entries are compact (no history/projections), so whenever the
  // selected ticker lacks projections we fetch its detail exactly once.
  useEffect(() => {
    if (selectedStock && !selectedStock.projections && !fetchingLiveDetail) {
      loadDetail(selectedStock.ticker);
    }
  }, [selectedStock?.ticker, selectedStock?.projections]);

  // Selecting a stock is instant (uses the compact list entry); the detail
  // (chart history + projections) then streams in via loadDetail.
  const handleSelectStock = (stock: StockDetails) => {
    setSelectedStock(stock);
  };

  // Select a stock by ticker (used by the Daily Decision Engine result cards).
  const handleSelectByTicker = (ticker: string) => {
    const found = stocks.find(s => s.ticker === ticker);
    if (found) {
      setSelectedStock(found);
      if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const loadDetail = async (ticker: string) => {
    setFetchingLiveDetail(true);
    try {
      const res = await fetch(apiUrl(`/api/stocks/detail?ticker=${encodeURIComponent(ticker)}`));
      if (res.ok) {
        const data = await res.json();
        if (data.stock) {
          setSelectedStock(prev => (prev && prev.ticker === ticker ? data.stock : prev));
        }
      }
    } catch (err) {
      console.warn("Failed to retrieve live Yahoo Finance detail on demand", err);
    } finally {
      setFetchingLiveDetail(false);
    }
  };

  // Add custom ticker symbol dynamically
  const handleAddTicker = async (e: FormEvent) => {
    e.preventDefault();
    if (!searchTicker || searchTicker.trim().length === 0) return;
    
    setAddingStock(true);
    setError(null);
    const targetTicker = searchTicker.trim().toUpperCase();

    try {
      const res = await fetch(apiUrl("/api/stocks/add"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: targetTicker })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Ticker symbol not found or invalid.");
      }

      const data = await res.json();
      
      // Update stocks
      setStocks(prev => {
        // Remove existing duplicate if any, and place new on top
        const filtered = prev.filter(s => s.ticker !== targetTicker);
        return [data.stock, ...filtered];
      });
      setSelectedStock(data.stock);
      setSearchTicker("");
    } catch (err: any) {
      setError(err.message || "Failed to import custom equity asset.");
    } finally {
      setAddingStock(false);
    }
  };

  // Toggle filter configurations
  const handleToggleFilter = (key: keyof FilterConfig) => {
    setFilters(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleResetFilters = () => {
    setFilters({
      closeAbove100: false,
      closeAbove20wEma: false,
      closeAbove50wEma: false,
      closeAbove200wEma: false,
      rsiBetween55And70: false,
      volumeAbove2Sma20: false,
      dailyVolAbove1_5Sma20: false,
      closeAbove8wHigh: false,
    });
  };

  // Compute filtered stocks
  const filteredStocks = useMemo(() => {
    let list = stocks;

    if (listSearchQuery.trim()) {
      const q = listSearchQuery.trim().toLowerCase();
      list = list.filter(stock => 
        stock.ticker.toLowerCase().includes(q) ||
        stock.name.toLowerCase().includes(q)
      );
    }

    const activeFilterKeys = Object.keys(filters).filter(k => filters[k as keyof FilterConfig]);
    
    if (activeFilterKeys.length === 0) {
      return list;
    }

    return list.filter(stock => {
      // Only real (live) data can be a genuine screener match; exclude
      // not-yet-warmed synthetic placeholders so they never pollute results.
      if (!stock.isLive) return false;
      return activeFilterKeys.every(filterKey => {
        if (filterKey === "closeAbove100") return stock.filtersMatched.closeAbove100;
        if (filterKey === "closeAbove20wEma") return stock.filtersMatched.closeAbove20wEma;
        if (filterKey === "closeAbove50wEma") return stock.filtersMatched.closeAbove50wEma;
        if (filterKey === "closeAbove200wEma") return stock.filtersMatched.closeAbove200wEma;
        if (filterKey === "rsiBetween55And70") return stock.filtersMatched.rsiBetween55And70;
        if (filterKey === "volumeAbove2Sma20") return stock.filtersMatched.volumeAbove2Sma20;
        if (filterKey === "dailyVolAbove1_5Sma20") return stock.filtersMatched.dailyVolAbove1_5Sma20;
        if (filterKey === "closeAbove8wHigh") return stock.filtersMatched.closeAbove8wHigh;
        return true;
      });
    });
  }, [stocks, filters, listSearchQuery]);

  // Per-filter live match counts, so each toggle shows how many real (live)
  // stocks currently satisfy it on its own. Makes it obvious a rare filter
  // (e.g. weekly volume spike) is working — just genuinely selective — and that
  // counts climb while the live cache warms after a restart.
  const filterCounts = useMemo(() => {
    const live = stocks.filter(s => s.isLive);
    const counts = {} as Record<keyof FilterConfig, number>;
    for (const { key } of FILTER_DEFS) {
      counts[key] = live.filter(s => s.filtersMatched[key]).length;
    }
    return { counts, liveTotal: live.length };
  }, [stocks]);

  // Stage-2 (Daily Decision Engine) operates on the weekly-matched watchlist.
  // Only meaningful when weekly filters are active; otherwise the "matches" are
  // the entire universe, which we don't feed into the daily stage.
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const weeklyMatches = hasActiveFilters ? filteredStocks : [];

  // Color logic helper for entry badges
  const getEntryLabelColor = (rec: string) => {
    if (rec.includes("PERFECT")) return "bg-emerald-500/15 text-emerald-400 border border-emerald-400/30 font-bold animate-pulse";
    if (rec.includes("BREAKOUT")) return "bg-teal-500/15 text-teal-400 border border-teal-400/20";
    if (rec.includes("CONVICTION")) return "bg-blue-500/15 text-blue-400 border border-blue-400/20";
    if (rec.includes("ACCUMULATION")) return "bg-amber-500/15 text-amber-400 border border-amber-400/20";
    if (rec.includes("TAKE PROFIT")) return "bg-purple-500/15 text-purple-400 border border-purple-400/20";
    if (rec.includes("AVOID")) return "bg-rose-500/15 text-rose-400 border border-rose-400/20";
    return "bg-slate-800 text-slate-400 border border-slate-700/60";
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-300">
      
      {/* 1. Header Navigation Bar */}
      <header className="border-b border-slate-800/80 bg-[#090e1a]/95 backdrop-blur-md sticky top-0 z-30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          
          {/* Logo & Online Status */}
          <div className="flex items-center justify-between w-full md:w-auto">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <Activity size={20} className="text-emerald-400" />
              </div>
              <div>
                <h1 className="text-base font-bold tracking-tight text-slate-100 flex items-center gap-1.5 font-sans">
                  ABK<span className="text-emerald-400 font-extrabold">Screener</span>
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-wider">
                    RADAR NETWORK: ACTIVE
                  </span>
                </div>
              </div>
            </div>

            {/* Refresh Poll status on Mobile */}
            <div className="md:hidden flex items-center gap-2">
              <button 
                onClick={() => fetchStocks(true)}
                className={`p-1.5 rounded-lg border border-slate-800 bg-[#0c101b] text-slate-400 hover:text-slate-200 transition-all ${
                  refreshing ? "animate-spin text-emerald-400" : ""
                }`}
              >
                <RotateCw size={14} />
              </button>
            </div>
          </div>

          {/* Dynamic Scrolling Market Ticker tape */}
          <div className="hidden lg:flex flex-1 max-w-lg mx-6 overflow-hidden bg-slate-950/40 border border-slate-800/80 rounded-xl py-1.5 px-4 font-mono text-xs text-slate-400">
            <div className="flex gap-6 animate-[marquee_25s_linear_infinite] whitespace-nowrap">
              {stocks.slice(0, 8).map(s => (
                <span key={s.ticker} className="inline-flex items-center gap-1.5">
                  <span className="font-bold text-slate-200">{s.ticker}</span>
                  <span className="text-slate-300">₹{fmtPrice(s.price)}</span>
                  <span className={`inline-flex items-center font-bold ${s.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {s.change >= 0 ? '+' : ''}{s.change}%
                    {s.change >= 0 ? <ArrowUpRight size={12} /> : <TrendingDown size={12} />}
                  </span>
                </span>
              ))}
            </div>
          </div>

          {/* Live Market Search & Dynamic Asset Adder */}
          <div className="relative w-full md:w-auto">
            <form onSubmit={handleAddTicker} className="flex gap-2 w-full md:w-auto relative">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-2.5 text-slate-500" size={14} />
                <input
                  type="text"
                  placeholder="Search 2,800+ stocks (e.g. Zomato, Tata)..."
                  value={searchTicker}
                  onChange={(e) => setSearchTicker(e.target.value)}
                  onFocus={() => { if (searchResults.length > 0) setShowSearchDropdown(true); }}
                  disabled={addingStock}
                  className="w-full pl-9 pr-8 py-2 bg-[#0c101b] border border-slate-800 hover:border-slate-700 focus:border-emerald-500/50 rounded-xl text-xs text-slate-100 placeholder-slate-500 outline-none transition-all font-mono"
                />
                {searchingMarket && (
                  <RotateCw className="absolute right-3 top-2.5 text-emerald-400 animate-spin" size={13} />
                )}
              </div>
              <button
                type="submit"
                disabled={addingStock || !searchTicker}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-slate-100 rounded-xl text-xs font-semibold flex items-center gap-1 transition-all shadow-lg shadow-emerald-500/5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {addingStock ? (
                  <RotateCw size={13} className="animate-spin" />
                ) : (
                  <Plus size={13} />
                )}
                Add
              </button>
            </form>

            {/* Live Autocomplete Results Dropdown */}
            {showSearchDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-[#0e1424] border border-slate-700/80 rounded-xl shadow-2xl z-50 max-h-72 overflow-y-auto divide-y divide-slate-800/60 font-sans">
                <div className="px-3 py-1.5 bg-slate-900/80 text-[10px] font-mono font-bold text-slate-400 flex justify-between items-center sticky top-0 backdrop-blur-md">
                  <span>MARKET SEARCH ({searchResults.length} FOUND)</span>
                  <button onClick={() => setShowSearchDropdown(false)} className="hover:text-slate-200">[ESC]</button>
                </div>
                {searchResults.map((item) => (
                  <div
                    key={`${item.exchange}-${item.symbol}`}
                    onClick={() => handleSelectSearchResult(item.symbol, item.exchange)}
                    className="px-3 py-2.5 hover:bg-emerald-500/10 cursor-pointer transition-colors flex items-center justify-between group"
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-100 group-hover:text-emerald-400 transition-colors">
                          {item.symbol}
                        </span>
                        <span className={`px-1.5 py-0.2 text-[9px] font-mono font-bold rounded ${
                          item.exchange === 'NSE' 
                            ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' 
                            : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                        }`}>
                          {item.exchange}
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-400 truncate block mt-0.5">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      SELECT &rarr;
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </header>

      {/* 2. Top Banner Errors */}
      {error && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 text-rose-400 text-xs px-4 py-3 font-medium flex justify-between items-center max-w-7xl mx-auto w-full mt-4 rounded-xl">
          <p className="flex items-center gap-2">
            <AlertTriangle size={15} />
            {error}
          </p>
          <button 
            onClick={() => setError(null)}
            className="text-rose-400/60 hover:text-rose-400 font-mono text-[10px]"
          >
            [DISMISS]
          </button>
        </div>
      )}

      {/* 3. Main Bento Dashboard Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 flex flex-col lg:flex-row gap-5">
        
        {/* Left column: Filters & Tracked lists */}
        <section className="w-full lg:w-1/4 flex flex-col gap-5">
          
          {/* Custom Screen Filters Panel */}
          <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4.5 backdrop-blur-md">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-800/60">
              <h2 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                <Filter size={13} className="text-emerald-400" />
                Momentum Toggles
              </h2>
              <button
                onClick={handleResetFilters}
                className="text-[10px] font-mono font-bold text-slate-500 hover:text-emerald-400 transition-colors"
              >
                [ RESET ]
              </button>
            </div>

            {/* Screener list toggles — each shows how many live stocks match it now */}
            <div className="flex flex-col gap-2 font-sans">
              {FILTER_DEFS.map(({ key, title, desc }) => {
                const count = filterCounts.counts[key];
                const active = filters[key];
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2.5 p-2 bg-[#0c101b]/60 border border-slate-800/50 hover:border-slate-800 rounded-xl cursor-pointer transition-all"
                  >
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => handleToggleFilter(key)}
                      className="rounded border-slate-800 text-emerald-600 focus:ring-emerald-500 bg-slate-900 w-4 h-4 accent-emerald-500"
                    />
                    <div className="text-xs flex-1 min-w-0">
                      <span className="font-mono font-bold block text-slate-300">{title}</span>
                      <span className="text-[10px] text-slate-500 block">{desc}</span>
                    </div>
                    <span
                      title={`${count} live stocks currently match this filter`}
                      className={`shrink-0 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                        count === 0
                          ? "bg-slate-800/50 text-slate-500 border-slate-700/40"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      }`}
                    >
                      {count}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-[9px] text-slate-600 font-mono mt-2.5 leading-relaxed">
              Numbers = live stocks matching each filter alone (of {filterCounts.liveTotal} live). Some filters (e.g.
              weekly volume spikes) are rare; stacking several narrows results fast. Counts climb for a few minutes after
              a deploy while live data warms up.
            </p>
          </div>

          {/* Tracked Equities List */}
          <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4.5 backdrop-blur-md flex-1 flex flex-col min-h-[300px]">
            <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-800/60">
              <h2 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wider">
                <Activity size={13} className="text-emerald-400" />
                Tracked Assets ({filteredStocks.length})
              </h2>
              {refreshing && (
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 animate-pulse">
                  <RotateCw size={10} className="animate-spin" />
                  SYNCING...
                </span>
              )}
            </div>

            {/* Quick in-list filter input */}
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2 text-slate-500" size={12} />
              <input
                type="text"
                placeholder="Filter 2,800+ assets..."
                value={listSearchQuery}
                onChange={(e) => setListSearchQuery(e.target.value)}
                className="w-full pl-8 pr-6 py-1.5 bg-[#0c101b] border border-slate-800 hover:border-slate-700 focus:border-emerald-500/50 rounded-lg text-[11px] text-slate-100 placeholder-slate-500 outline-none transition-all font-mono"
              />
              {listSearchQuery && (
                <button
                  onClick={() => setListSearchQuery("")}
                  className="absolute right-2.5 top-1.5 text-[10px] text-slate-500 hover:text-slate-300 font-mono"
                >
                  ×
                </button>
              )}
            </div>

            {loading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <RotateCw className="animate-spin text-emerald-400 mb-3" size={24} />
                <p className="text-xs font-mono text-slate-500">Retrieving weekly data...</p>
              </div>
            ) : filteredStocks.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/10 my-auto">
                <Filter className="text-slate-700 mb-2 animate-pulse" size={20} />
                <h4 className="text-xs font-semibold text-slate-400">No stocks match all selected filters</h4>
                <p className="text-[10px] text-slate-600 mt-0.5 leading-relaxed">
                  {filterCounts.liveTotal < 200
                    ? "Live data is still warming up — counts climb over the next few minutes. Try again shortly."
                    : "The combined filters are too strict right now. Uncheck one (watch the number badges) or add a custom symbol."}
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto max-h-[340px] lg:max-h-[480px] flex flex-col gap-2.5 pr-1">
                {filteredStocks.slice(0, LIST_LIMIT).map(stock => {
                  const isSelected = selectedStock?.ticker === stock.ticker;
                  return (
                    <div
                      key={stock.ticker}
                      onClick={() => handleSelectStock(stock)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-slate-800/80 border-emerald-500/40 shadow-lg shadow-emerald-500/5"
                          : "bg-[#0c101b]/60 border-slate-800/60 hover:border-slate-700/80"
                      }`}
                    >
                      <div className="flex justify-between items-start mb-1.5">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold font-mono text-slate-200 tracking-wide">
                              {stock.ticker.replace(/\.NS$/, '')}
                            </span>
                            {stock.recommendation && (
                              <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold tracking-wider font-mono ${
                                stock.recommendation.includes("BUY")
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : stock.recommendation.includes("SELL")
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  : "bg-slate-700/20 text-slate-400 border border-slate-700/30"
                              }`}>
                                {stock.recommendation}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500 block truncate max-w-[130px]">
                            {stock.name}
                          </span>
                          {stock.recommendation && (
                            <div className="flex items-center gap-1 mt-1 bg-slate-900/40 px-1.5 py-0.5 rounded border border-slate-800/40 w-fit">
                              <span className="text-[9px] text-slate-500 font-mono font-medium uppercase">SIGNAL:</span>
                              <span className={`text-[9px] font-extrabold font-mono tracking-wider uppercase ${
                                stock.recommendation.includes("BUY")
                                  ? "text-emerald-400"
                                  : stock.recommendation.includes("SELL")
                                  ? "text-rose-400"
                                  : "text-amber-400"
                              }`}>
                                {stock.recommendation}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right font-mono">
                          <span className="text-xs font-bold text-slate-200 block">
                            ₹{fmtPrice(stock.price)}
                          </span>
                          <span className={`text-[10px] font-bold ${stock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {stock.change >= 0 ? '+' : ''}{stock.change}%
                          </span>
                        </div>
                      </div>

                      {/* Display matched filters on the item */}
                      <div className="flex flex-wrap gap-1 mt-2 border-t border-slate-800/50 pt-2 text-[8px] font-mono">
                        {stock.filtersMatched.rsiBetween53And70 && (
                          <span className="px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 rounded">
                            RSI Zone
                          </span>
                        )}
                        {stock.filtersMatched.volumeAbove1_8Sma20 && (
                          <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-500 border border-amber-500/10 rounded">
                            Vol Spike
                          </span>
                        )}
                        {stock.filtersMatched.closeAbove8wHigh && (
                          <span className="px-1.5 py-0.5 bg-teal-500/10 text-teal-400 border border-teal-500/10 rounded">
                            8W Breakout
                          </span>
                        )}
                        {stock.filtersMatched.closeAbove200wEma && (
                          <span className="px-1.5 py-0.5 bg-purple-500/10 text-purple-400 border border-purple-500/10 rounded">
                            200W EMA
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {filteredStocks.length > LIST_LIMIT && (
                  <p className="text-center text-[10px] font-mono text-slate-600 py-2">
                    Showing top {LIST_LIMIT} of {filteredStocks.length}. Use the filters or search to narrow down.
                  </p>
                )}
              </div>
            )}
          </div>

        </section>

        {/* Right column: Charts, metric scorecard, and Gemini panel */}
        <section className="flex-1 flex flex-col gap-5">

          {/* Stage 2: Daily Decision Engine — runs on the weekly-matched watchlist */}
          <DailyDecisionEngine
            weeklyMatches={weeklyMatches}
            hasActiveFilters={hasActiveFilters}
            onSelectTicker={handleSelectByTicker}
          />

          {selectedStock ? (
            <div className="flex flex-col gap-5">
              
              {/* Selected Stock Overview Banner */}
              <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 backdrop-blur-md flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold font-mono tracking-tight text-slate-100">
                      {selectedStock.ticker}
                    </h2>
                    <span className="text-xs text-slate-400 font-sans">
                      {selectedStock.name}
                    </span>
                    <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-lg ${getEntryLabelColor(selectedStock.entryRecommendation)}`}>
                      {selectedStock.entryRecommendation}
                    </span>
                    
                    {/* Live/Simulated feed indicator */}
                    {fetchingLiveDetail ? (
                      <span className="px-2 py-0.5 text-[8px] font-mono font-extrabold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-md flex items-center gap-1 animate-pulse">
                        <RotateCw size={8} className="animate-spin" />
                        SYNCING LIVE FEED...
                      </span>
                    ) : selectedStock.isLive ? (
                      <span className="px-2 py-0.5 text-[8px] font-mono font-extrabold uppercase tracking-widest bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-md flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                        LIVE (YFINANCE)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-[8px] font-mono font-extrabold uppercase tracking-widest bg-slate-800 text-slate-400 border border-slate-700 rounded-md flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-slate-500 rounded-full" />
                        SIMULATED FEED
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Screener diagnostics & technical assessment overview</p>
                </div>

                <div className="flex items-baseline gap-4 self-stretch sm:self-auto justify-between border-t sm:border-t-0 border-slate-800/50 pt-3 sm:pt-0">
                  <div className="text-right">
                    <span className="text-slate-500 text-[10px] uppercase block font-mono">Current Price</span>
                    <span className="text-xl font-bold font-mono text-slate-100">₹{fmtPrice(selectedStock.price)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-slate-500 text-[10px] uppercase block font-mono">Weekly Change</span>
                    <span className={`text-sm font-bold font-mono block ${selectedStock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {selectedStock.change >= 0 ? '+' : ''}{selectedStock.change}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Main Workspace grid: Charts on Left, AI Advisor on Right */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                
                {/* Visual Chart & Scorecard metrics */}
                <div className="lg:col-span-2 flex flex-col gap-5">
                  
                  {/* Stock chart */}
                  <StockChart ticker={selectedStock.ticker} initialHistory={selectedStock.history} />

                  {/* Indicators checklist grid */}
                  <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4.5 backdrop-blur-md">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4 pb-2 border-b border-slate-800/60 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-emerald-400" />
                      Momentum Screener Scorecard
                    </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      
                      <MetricCard
                        label="Close Metric"
                        value={`₹${fmtPrice(selectedStock.indicators.close)}`}
                        subValue="₹100"
                        status={selectedStock.filtersMatched.closeAbove100 ? "pass" : "fail"}
                        ruleDescription="Specifies stock is safe with robust liquid institutional backing."
                      />

                      <MetricCard
                        label="20-Week EMA"
                        value={`₹${fmtPrice(selectedStock.indicators.close)}`}
                        subValue={`₹${fmtPrice(selectedStock.indicators.ema20)}`}
                        status={selectedStock.filtersMatched.closeAbove20wEma ? "pass" : "fail"}
                        ruleDescription="Specifies asset is maintaining active short-term bullish momentum."
                      />

                      <MetricCard
                        label="50-Week EMA"
                        value={`₹${fmtPrice(selectedStock.indicators.close)}`}
                        subValue={`₹${fmtPrice(selectedStock.indicators.ema50)}`}
                        status={selectedStock.filtersMatched.closeAbove50wEma ? "pass" : "fail"}
                        ruleDescription="Specifies active medium-term structural trend support."
                      />

                      <MetricCard
                        label="200-Week EMA"
                        value={`₹${fmtPrice(selectedStock.indicators.close)}`}
                        subValue={`₹${fmtPrice(selectedStock.indicators.ema200)}`}
                        status={selectedStock.filtersMatched.closeAbove200wEma ? "pass" : "fail"}
                        ruleDescription="Specifies major safety guardrail. Crucial macro-trend support."
                      />

                      <MetricCard
                        label="Weekly RSI (14)"
                        value={selectedStock.indicators.rsi}
                        subValue="55 - 70"
                        status={selectedStock.indicators.rsi >= 55 && selectedStock.indicators.rsi <= 70 ? "pass" : "fail"}
                        ruleDescription="The perfect momentum threshold preceding parabolic expansions."
                      />

                      <MetricCard
                        label="Weekly Volume (2.0x)"
                        value={`${(selectedStock.indicators.volume / 1000000).toFixed(1)}M`}
                        subValue={`${((2.0 * selectedStock.indicators.volumeSma20) / 1000000).toFixed(1)}M`}
                        status={selectedStock.indicators.volume >= 2.0 * selectedStock.indicators.volumeSma20 || selectedStock.filtersMatched.volumeAbove2Sma20 ? "pass" : "fail"}
                        ruleDescription="Specifies heavy institutional conviction volume expansion (>2.0x 20W SMA)."
                      />

                      <MetricCard
                        label="8-Week Breakout"
                        value={`₹${fmtPrice(selectedStock.indicators.close)}`}
                        subValue={`₹${fmtPrice(selectedStock.indicators.high8w)}`}
                        status={selectedStock.filtersMatched.closeAbove8wHigh ? "pass" : "fail"}
                        ruleDescription="Specifies breakout from horizontal consolidations."
                      />

                    </div>
                  </div>

                  {/* Investment projection calculator */}
                  <InvestmentCalculator stock={selectedStock} />

                </div>

                {/* Gemini AI Analyst Board */}
                <div className="lg:col-span-1">
                  <AiAnalysisPanel stock={selectedStock} />
                </div>

              </div>

              {/* 10-year strategy backtest (full width) */}
              <BacktestPanel ticker={selectedStock.ticker} />

            </div>
          ) : (
            <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-12 text-center backdrop-blur-md flex flex-col items-center justify-center min-h-[400px]">
              <RotateCw className="animate-spin text-emerald-400 mb-3" size={32} />
              <h3 className="text-base font-bold text-slate-300">Synchronizing Stock Grid</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
                Loading professional momentum metrics, EMAs, and RSI boundaries...
              </p>
            </div>
          )}

        </section>

      </main>

      {/* 4. Footer credits and network status */}
      <footer className="border-t border-slate-800/80 bg-[#090e1a]/40 p-4 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-2 text-[11px] font-mono text-slate-500">
          <p>© 2026 ABK Screener. All technical indicators calculated via Welles Wilder smoothing and exponential algorithm.</p>
          <div className="flex items-center gap-4">
            <span>POLL INTERVAL: 60s</span>
            <span>SYSTEM CONVERGENCE: STABLE</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
