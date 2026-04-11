"use client";
import { useState, useCallback } from "react";
import MapWrapper from "@/components/MapWrapper";
import AgentTerminal from "@/components/AgentTerminal";
import CredibilityRadar from "@/components/CredibilityRadar";
import SubmitFact from "@/components/SubmitFact";
import StatsBar from "@/components/StatsBar";
import { Activity } from "lucide-react";

export default function Dashboard() {
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSelectFact = useCallback((id: string, claim: string) => {
    setSelectedFactId(id);
    setSelectedClaim(claim);
  }, []);

  const handleSubmitted = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  return (
    <main className="h-screen w-screen p-3 flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <header className="glass-card flex justify-between items-center px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 p-2.5 rounded-xl border border-cyan-500/10">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">
              APERTURE <span className="text-cyan-400">PROTOCOL</span>
            </h1>
            <p className="text-[10px] text-slate-500 uppercase tracking-[0.2em]">
              Trustless Intelligence Marketplace
            </p>
          </div>
        </div>
        <StatsBar />
      </header>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-3 min-h-0">
        {/* Map (takes 2 cols) */}
        <div className="lg:col-span-2 relative rounded-xl overflow-hidden border border-slate-800/60 shadow-2xl">
          <MapWrapper onSelectFact={handleSelectFact} />
          <div className="absolute top-3 left-3 z-[400] bg-slate-950/80 backdrop-blur-md border border-slate-800/60 px-3 py-1.5 rounded-lg">
            <p className="text-[10px] font-mono text-cyan-400 tracking-wider">
              LIVE FEED • BENGALURU, IN
            </p>
          </div>
        </div>

        {/* Right Panel: Submit + Radar */}
        <div className="flex flex-col gap-3 min-h-0">
          <div className="h-[55%]">
            <SubmitFact onSubmitted={handleSubmitted} />
          </div>
          <div className="h-[45%]">
            <CredibilityRadar factId={selectedFactId} factClaim={selectedClaim} />
          </div>
        </div>

        {/* Far Right: Activity Log */}
        <div className="min-h-0">
          <AgentTerminal key={refreshKey} />
        </div>
      </div>
    </main>
  );
}