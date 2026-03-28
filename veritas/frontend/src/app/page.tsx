"use client"; // Add this at the top
import { useState } from "react";
import MapWrapper from "@/components/MapWrapper";
import AgentTerminal from "@/components/AgentTerminal";
import CredibilityRadar from "@/components/CredibilityRadar";
import { Activity } from "lucide-react";

export default function Dashboard() {
  const [selectedFact, setSelectedFact] = useState<any>(null);

  return (
    <main className="h-screen w-screen p-4 flex flex-col gap-4 overflow-hidden">
      <header className="flex justify-between items-center bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/20 p-2 rounded-lg"><Activity className="w-6 h-6 text-cyan-400" /></div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">VERITAS PROTOCOL</h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest">Agentic Data Marketplace</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400 uppercase">Network Status</p>
          <p className="text-sm font-mono text-emerald-400">ONLINE (Arc Testnet Simulation)</p>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">
        <div className="lg:col-span-2 relative rounded-xl overflow-hidden border border-slate-800 shadow-2xl">
          <MapWrapper onSelectFact={setSelectedFact} />
          <div className="absolute top-4 left-4 z-[400] bg-slate-950/80 backdrop-blur-md border border-slate-800 px-3 py-2 rounded-lg">
            <p className="text-xs font-mono text-cyan-400">LIVE FEED • BENGALURU, IN</p>
          </div>
        </div>

        <div className="flex flex-col gap-4 min-h-0">
          <div className="h-[40%]">
            {/* Pass the selected fact data to the Radar */}
            <CredibilityRadar data={selectedFact} />
          </div>
          <div className="h-[60%]">
            <AgentTerminal />
          </div>
        </div>
      </div>
    </main>
  );
}