"use client";
import { useEffect, useState, useRef } from "react";
import { Settings, Eye, EyeOff, Brain, BrainCircuit, Bot } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface DemoConfig {
  imageVerificationEnabled: boolean;
  heuristicEngineEnabled: boolean;
}

interface DemoControlsProps {
  onRunAgent?: () => void;
}

export default function DemoControls({ onRunAgent }: DemoControlsProps) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<DemoConfig>({
    imageVerificationEnabled: true,
    heuristicEngineEnabled: true,
  });
  const [syncing, setSyncing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch current config on mount
  useEffect(() => {
    fetch(`${API}/demo/config`)
      .then(r => r.json())
      .then(data => { if (data.config) setConfig(data.config); })
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const updateConfig = async (update: Partial<DemoConfig>) => {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/demo/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const data = await res.json();
      if (data.config) setConfig(data.config);
    } catch {
      // Revert on failure
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
          open
            ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30"
            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 border border-transparent"
        }`}
      >
        <Settings className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} />
        <span className="font-medium">Demo</span>
        {(!config.imageVerificationEnabled || !config.heuristicEngineEnabled) && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 glass-card p-3 z-[500] animate-fade-in-up shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Demo Controls</h3>
            {syncing && (
              <span className="text-[9px] text-cyan-400 animate-pulse">syncing...</span>
            )}
          </div>

          {/* Toggle 1: Image Verification */}
          <div className="flex items-center justify-between py-2.5 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              {config.imageVerificationEnabled ? (
                <Eye className="w-4 h-4 text-cyan-400" />
              ) : (
                <EyeOff className="w-4 h-4 text-slate-500" />
              )}
              <div>
                <p className="text-xs text-slate-200 font-medium">Image Verification</p>
                <p className="text-[10px] text-slate-500">Gemini + Street View pipeline</p>
              </div>
            </div>
            <div
              className={`toggle-switch ${config.imageVerificationEnabled ? "active" : ""}`}
              onClick={() => updateConfig({ imageVerificationEnabled: !config.imageVerificationEnabled })}
            />
          </div>

          {/* Toggle 2: Heuristic Engine */}
          <div className="flex items-center justify-between py-2.5">
            <div className="flex items-center gap-2">
              {config.heuristicEngineEnabled ? (
                <BrainCircuit className="w-4 h-4 text-cyan-400" />
              ) : (
                <Brain className="w-4 h-4 text-slate-500" />
              )}
              <div>
                <p className="text-xs text-slate-200 font-medium">Heuristic Engine</p>
                <p className="text-[10px] text-slate-500">6-signal Bayesian scoring</p>
              </div>
            </div>
            <div
              className={`toggle-switch ${config.heuristicEngineEnabled ? "active" : ""}`}
              onClick={() => updateConfig({ heuristicEngineEnabled: !config.heuristicEngineEnabled })}
            />
          </div>

          {/* Run Agent Button */}
          <div className="mt-2 pt-2 border-t border-slate-800/60">
            <button
              onClick={() => {
                window.open('/agent', '_blank');
                setOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all cursor-pointer bg-violet-600/15 text-violet-300 border border-violet-500/25 hover:bg-violet-600/25 hover:border-violet-500/40 hover:text-violet-200"
            >
              <Bot className="w-3.5 h-3.5" />
              Open Agent Demo ↗
            </button>
            <p className="text-[10px] text-slate-600 text-center mt-1.5">
              Full-screen demo of AI buying intelligence
            </p>
          </div>

          {/* Status summary */}
          <div className="mt-2 pt-2 border-t border-slate-800/60">
            <p className="text-[10px] text-slate-600 text-center">
              Changes apply immediately — no restart needed
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
