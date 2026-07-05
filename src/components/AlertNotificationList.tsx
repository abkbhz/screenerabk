import { useState, useEffect } from "react";
import { MarketAlert } from "../types";
import { Bell, BellOff, Volume2, VolumeX, ShieldAlert, CircleAlert, Trash2, ExternalLink } from "lucide-react";

interface AlertNotificationListProps {
  alerts: MarketAlert[];
  onClearAlerts: () => void;
  onSelectStock: (ticker: string) => void;
}

export function playAlertChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
    osc1.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5

    osc2.type = "triangle";
    osc2.frequency.setValueAtTime(392, ctx.currentTime); // G4
    osc2.frequency.exponentialRampToValueAtTime(1318.51, ctx.currentTime + 0.18); // E6

    gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start();
    osc2.start();
    osc1.stop(ctx.currentTime + 0.4);
    osc2.stop(ctx.currentTime + 0.4);
  } catch (e) {
    console.warn("Web Audio chime failed:", e);
  }
}

export default function AlertNotificationList({ alerts, onClearAlerts, onSelectStock }: AlertNotificationListProps) {
  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  useEffect(() => {
    // Check Notification support and current status
    if ("Notification" in window) {
      setBrowserNotificationsEnabled(Notification.permission === "granted");
    }
  }, []);

  const toggleBrowserNotifications = async () => {
    if (!("Notification" in window)) {
      alert("Browser notifications not supported on this browser.");
      return;
    }

    if (Notification.permission === "granted") {
      setBrowserNotificationsEnabled(true);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setBrowserNotificationsEnabled(true);
      // Send a confirmation test notice
      new Notification("Perfect Entry Activated", {
        body: "You will now receive timely alerts when stocks meet critical entry/exit parameters.",
        icon: "/favicon.ico"
      });
    } else {
      setBrowserNotificationsEnabled(false);
    }
  };

  const testTriggerAlert = () => {
    // Play sound if toggled
    if (soundEnabled) {
      playAlertChime();
    }
    // Browser notification
    if (browserNotificationsEnabled && "Notification" in window && Notification.permission === "granted") {
      new Notification("Perfect Entry Signal: NVDA", {
        body: "NVDA has cleared 20W EMA on high breakout volume - RSI target zone matched!",
      });
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "entry":
        return <ShieldAlert className="text-emerald-400" size={16} />;
      case "exit":
        return <CircleAlert className="text-rose-400" size={16} />;
      default:
        return <Bell className="text-amber-400" size={16} />;
    }
  };

  return (
    <div className="bg-[#111827]/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md flex flex-col h-full">
      {/* Title & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/60 pb-4 mb-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
            <Bell size={16} className="text-emerald-400 animate-bounce" />
            Timely Entry & Exit Radar
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Automated signal breakout alerts history</p>
        </div>

        {/* Action Toggles */}
        <div className="flex gap-2 self-stretch sm:self-auto font-mono text-[11px]">
          <button
            onClick={toggleBrowserNotifications}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
              browserNotificationsEnabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
            title="Toggle standard desktop notifications"
          >
            {browserNotificationsEnabled ? <Bell size={13} /> : <BellOff size={13} />}
            {browserNotificationsEnabled ? "DESKTOP: ON" : "DESKTOP: OFF"}
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all ${
              soundEnabled
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
            title="Toggle alerts sound chime"
          >
            {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
            {soundEnabled ? "SOUND: ON" : "SOUND: OFF"}
          </button>
        </div>
      </div>

      {/* Main Alert Logs */}
      <div className="flex-1 overflow-y-auto max-h-[220px] sm:max-h-none flex flex-col gap-2.5 pr-1 min-h-[140px]">
        {alerts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-8 text-center bg-slate-900/15 rounded-xl border border-dashed border-slate-800/80 my-auto">
            <Bell className="text-slate-700 mb-2 animate-pulse" size={24} />
            <h4 className="text-xs font-semibold text-slate-400">Scanning Weekly Charts</h4>
            <p className="text-[10px] text-slate-600 max-w-xs mt-0.5 leading-relaxed">
              No breakout entry/exit criteria met in the last session interval.
            </p>
          </div>
        ) : (
          alerts.map((alertItem) => (
            <div
              key={alertItem.id}
              onClick={() => onSelectStock(alertItem.ticker)}
              className={`p-3 rounded-xl border flex gap-3 items-start hover:border-slate-700 transition-all cursor-pointer group ${
                alertItem.type === "entry"
                  ? "bg-emerald-500/5 border-emerald-500/10"
                  : alertItem.type === "exit"
                    ? "bg-rose-500/5 border-rose-500/10"
                    : "bg-amber-500/5 border-amber-500/10"
              }`}
            >
              <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800/60">
                {getAlertIcon(alertItem.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-0.5">
                  <span className="text-xs font-bold font-mono text-slate-200 tracking-wide group-hover:text-emerald-400 transition-colors">
                    {alertItem.ticker}
                  </span>
                  <span className="text-[9px] font-mono text-slate-500">
                    {alertItem.timestamp}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-normal font-sans">
                  {alertItem.message}
                </p>
              </div>
              <div className="self-center text-slate-600 group-hover:text-slate-400 transition-colors">
                <ExternalLink size={12} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer radar actions */}
      {alerts.length > 0 && (
        <div className="flex justify-between items-center border-t border-slate-800/60 pt-3.5 mt-4">
          <button
            onClick={testTriggerAlert}
            className="text-[10px] font-mono font-bold text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
          >
            [ TEST RADAR BEACON ]
          </button>
          <button
            onClick={onClearAlerts}
            className="flex items-center gap-1 text-[10px] font-mono font-bold text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
          >
            <Trash2 size={12} />
            CLEAR RADAR LOGS
          </button>
        </div>
      )}
    </div>
  );
}
