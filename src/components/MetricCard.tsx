import { ArrowUpRight, ArrowDownRight, CheckCircle2, XCircle } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string | number;
  status: "pass" | "fail" | "neutral";
  ruleDescription: string;
}

export default function MetricCard({ label, value, subValue, status, ruleDescription }: MetricCardProps) {
  const isPass = status === "pass";
  const isFail = status === "fail";

  return (
    <div className={`p-4 rounded-xl border backdrop-blur-sm transition-all duration-300 ${
      isPass 
        ? "bg-emerald-500/5 border-emerald-500/20 shadow-lg shadow-emerald-500/5" 
        : isFail
          ? "bg-rose-500/5 border-rose-500/10"
          : "bg-slate-900/40 border-slate-800"
    }`}>
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs text-slate-400 font-medium tracking-wide uppercase">{label}</span>
        {status !== "neutral" && (
          <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isPass ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
          }`}>
            {isPass ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
            {isPass ? "PASS" : "FAIL"}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold font-mono text-slate-100">{value}</span>
        {subValue && (
          <span className="text-xs font-mono text-slate-500">/ {subValue}</span>
        )}
      </div>

      <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed font-sans">
        {ruleDescription}
      </p>
    </div>
  );
}
