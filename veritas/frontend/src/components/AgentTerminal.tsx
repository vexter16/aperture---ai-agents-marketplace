"use client";
import { Terminal } from "lucide-react";

export default function AgentTerminal() {
  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-2xl">
      <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-slate-900/50">
        <Terminal className="w-4 h-4 text-emerald-400 mr-2" />
        <h2 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">Agent Activity Log</h2>
        <span className="ml-auto flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
      </div>
      <div className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs">
        <div className="text-slate-400 animate-fade-in">
          <span className="text-slate-500">[10:42:01]</span> 🔍 [Scout Agent] Searching for "emergency blaze"...
        </div>
        <div className="text-emerald-400 animate-fade-in" style={{animationDelay: '0.2s'}}>
          <span className="text-slate-500">[10:42:02]</span> 📊 Found 1 relevant fact. Similarity: 39.0%
        </div>
        <div className="text-amber-400 animate-fade-in" style={{animationDelay: '0.4s'}}>
          <span className="text-slate-500">[10:42:03]</span> 🛑 Hit x402 Paywall. Cost: $0.05 USDC
        </div>
        <div className="text-cyan-400 animate-fade-in" style={{animationDelay: '0.6s'}}>
          <span className="text-slate-500">[10:42:04]</span> 💸 Executing cryptographic transaction...
        </div>
        <div className="text-emerald-400 animate-fade-in font-bold" style={{animationDelay: '0.8s'}}>
          <span className="text-slate-500">[10:42:05]</span> ✅ PURCHASE SUCCESSFUL! Payload downloaded.
        </div>
      </div>
    </div>
  );
}