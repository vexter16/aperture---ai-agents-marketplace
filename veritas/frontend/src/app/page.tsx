"use client";
import { useState, useCallback } from "react";
import Link from "next/link";
import MapWrapper from "@/components/MapWrapper";
import AgentTerminal from "@/components/AgentTerminal";
import CredibilityRadar from "@/components/CredibilityRadar";
import SubmitFact from "@/components/SubmitFact";
import StatsBar from "@/components/StatsBar";
import DemoControls from "@/components/DemoControls";
import VerificationViewer, { VerificationData } from "@/components/VerificationViewer";
import { Activity, Scan, Bot } from "lucide-react";

export default function Dashboard() {
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [selectedClaim, setSelectedClaim] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [verificationData, setVerificationData] = useState<VerificationData | null>(null);
  const [activeTab, setActiveTab] = useState<"activity" | "verification">("activity");

  const handleSelectFact = useCallback((id: string, claim: string) => {
    setSelectedFactId(id);
    setSelectedClaim(claim);
  }, []);

  const handleSubmitted = useCallback(() => {
    setRefreshKey(k => k + 1);
  }, []);

  const handleVerification = useCallback((data: VerificationData) => {
    setVerificationData(data);
    setActiveTab("verification"); // Auto-switch to verification tab on new submission
  }, []);

  // Called when VerificationViewer detects a new submission via polling /verification/latest
  const handlePolledVerification = useCallback((data: VerificationData) => {
    setVerificationData(data);
    setActiveTab("verification");
  }, []);

  const handleRunAgent = useCallback(() => {
    // Navigate to the standalone agent demo page
    window.open('/agent', '_blank');
  }, []);

  return (
    <main className="h-screen w-screen p-3 flex flex-col gap-3 overflow-hidden">
      {/* Header */}
      <header className="glass-card flex justify-between items-center px-5 py-3 relative z-50">
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
        <div className="flex items-center gap-3">
          <StatsBar />
          <DemoControls onRunAgent={handleRunAgent} />
        </div>
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
            <SubmitFact onSubmitted={handleSubmitted} onVerification={handleVerification} />
          </div>
          <div className="h-[45%]">
            <CredibilityRadar factId={selectedFactId} factClaim={selectedClaim} />
          </div>
        </div>

        {/* Far Right: Tabbed Activity / Verification / Agent POV */}
        <div className="min-h-0 glass-card flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-800/60">
            <button
              className={`tab-btn ${activeTab === "activity" ? "active" : ""}`}
              onClick={() => setActiveTab("activity")}
            >
              <span className="flex items-center gap-1.5">
                <Activity className="w-3 h-3" />
                Activity
              </span>
            </button>
            <button
              className={`tab-btn ${activeTab === "verification" ? "active" : ""}`}
              onClick={() => setActiveTab("verification")}
            >
              <span className="flex items-center gap-1.5">
                <Scan className="w-3 h-3" />
                Verification
                {verificationData && (
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    verificationData.coherence?.coherent !== false ? 'bg-emerald-400' : 'bg-red-400'
                  }`} />
                )}
              </span>
            </button>
            <Link href="/agent" target="_blank"
              className="tab-btn flex items-center gap-1.5 text-slate-500 hover:text-violet-300 hover:bg-violet-500/10 transition-colors">
              <Bot className="w-3 h-3" />
              Agent Demo ↗
            </Link>
          </div>

          {/* Tab Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {activeTab === "activity" ? (
              <AgentTerminal key={refreshKey} />
            ) : (
              <div className="p-3 h-full overflow-y-auto">
                <VerificationViewer data={verificationData} factId={selectedFactId} onNewVerification={handlePolledVerification} />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}