"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  ArrowLeft, Bot, Truck, Zap, Search, Table2, MousePointerClick,
  CreditCard, MapPin, Brain, Scale, CheckCircle2, Flame,
  ChevronDown, ChevronUp, Loader2, Activity, ExternalLink,
  Shield, TrendingUp, Globe
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface AgentEvent {
  step: string;
  type: string;
  status: "in_progress" | "complete" | "error";
  thinking: string;
  data?: Record<string, any>;
  timestamp: string;
}

interface Scenario {
  id: string;
  agentName: string;
  agentRole: string;
  agentColor: string;
  agentEmoji: string;
  domain: string;
  missionBrief: string;
  businessContext: string;
  expectedVerdict: string;
  streetViewLat: number;
  streetViewLng: number;
  streetViewLocation: string;
}

// ─────────────────────────────────────────────
// STEP ICON MAP
// ─────────────────────────────────────────────

function getStepMeta(type: string) {
  const map: Record<string, { icon: any; color: string; bg: string; label: string }> = {
    init:       { icon: Bot,              color: "text-violet-400",  bg: "bg-violet-500/10 border-violet-500/20",  label: "Agent Boot"        },
    query:      { icon: Search,           color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/20",      label: "Query Issued"      },
    searching:  { icon: Globe,            color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20",      label: "Searching"         },
    results:    { icon: Table2,           color: "text-indigo-400",  bg: "bg-indigo-500/10 border-indigo-500/20",  label: "Results"           },
    selected:   { icon: MousePointerClick,color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20",   label: "Selected"          },
    purchasing: { icon: CreditCard,       color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20",label: "x402 Payment"     },
    streetview: { icon: MapPin,           color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/20",     label: "Location Verified" },
    verifying:  { icon: Brain,            color: "text-pink-400",    bg: "bg-pink-500/10 border-pink-500/20",     label: "AI Verification"   },
    feedback:   { icon: Scale,            color: "text-orange-400",  bg: "bg-orange-500/10 border-orange-500/20", label: "Verdict Submitted"  },
    settlement: { icon: Zap,             color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20", label: "Settlement"        },
    complete:   { icon: CheckCircle2,     color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20",label: "Complete"         },
    error:      { icon: Flame,            color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20",       label: "Error"             },
    no_facts:   { icon: Search,           color: "text-slate-500",   bg: "bg-slate-800/30 border-slate-700/30",   label: "No Data"           },
  };
  return map[type] || map.init;
}

// ─────────────────────────────────────────────
// SCENARIO CARD
// ─────────────────────────────────────────────

function ScenarioCard({ scenario, active, running, onClick }: {
  scenario: Scenario;
  active: boolean;
  running: boolean;
  onClick: () => void;
}) {
  const isLogistics = scenario.domain === "logistics";
  const accent = isLogistics ? "violet" : "amber";
  const activeClass = active
    ? `border-${accent}-500/40 bg-${accent}-500/10`
    : "border-slate-700/50 bg-slate-900/50 hover:border-slate-600/50 hover:bg-slate-800/50";

  return (
    <button
      onClick={onClick}
      disabled={running}
      className={`relative w-full text-left rounded-2xl border p-5 transition-all cursor-pointer ${activeClass}`}
    >
      {active && (
        <div className={`absolute top-3 right-3 text-[9px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider ${
          isLogistics ? "bg-violet-500/20 text-violet-400" : "bg-amber-500/20 text-amber-400"
        }`}>
          SELECTED
        </div>
      )}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
          isLogistics ? "bg-violet-500/15 border border-violet-500/20" : "bg-amber-500/15 border border-amber-500/20"
        }`}>
          {scenario.agentEmoji}
        </div>
        <div>
          <p className={`text-sm font-bold ${isLogistics ? "text-violet-300" : "text-amber-300"}`}>
            {scenario.agentName}
          </p>
          <p className="text-[11px] text-slate-400">{scenario.agentRole}</p>
          <div className={`inline-block mt-1 text-[9px] font-mono px-1.5 py-0.5 rounded uppercase tracking-wider ${
            isLogistics ? "bg-violet-500/10 text-violet-500" : "bg-amber-500/10 text-amber-500"
          }`}>
            {scenario.domain}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-slate-500 leading-relaxed line-clamp-2">
        {scenario.missionBrief}
      </p>
      <div className="mt-2 flex items-center gap-1">
        <CheckCircle2 className="w-3 h-3 text-emerald-500/60" />
        <span className="text-[10px] text-emerald-500/60">Expected: CONFIRMED → Stake Released</span>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────
// SEARCH RESULTS TABLE
// ─────────────────────────────────────────────

function SearchResultsTable({ candidates, selectedId }: { candidates: any[]; selectedId?: string }) {
  return (
    <div className="rounded-xl border border-slate-700/50 overflow-hidden">
      <div className="grid text-[9px] font-mono uppercase tracking-wider text-slate-500 bg-slate-900/80 px-3 py-2 border-b border-slate-700/50"
           style={{ gridTemplateColumns: "2rem 1fr 6rem 5rem 5rem 5rem" }}>
        <span>#</span>
        <span>Intelligence Claim</span>
        <span>Domain</span>
        <span>Credibility</span>
        <span>Relevance</span>
        <span>Price</span>
      </div>
      {candidates.map((c: any, i: number) => {
        const isSelected = c.id === selectedId || i === 0;
        return (
          <div
            key={c.id || i}
            className={`grid items-center px-3 py-2.5 border-b border-slate-800/40 last:border-0 transition-colors ${
              isSelected ? "bg-cyan-500/8 border-l-2 border-l-cyan-500/50" : "hover:bg-slate-800/20"
            }`}
            style={{ gridTemplateColumns: "2rem 1fr 6rem 5rem 5rem 5rem" }}
          >
            <span className={`text-[10px] font-mono ${isSelected ? "text-cyan-400 font-bold" : "text-slate-600"}`}>
              {isSelected ? "★" : `${i + 1}`}
            </span>
            <div className="pr-2 min-w-0">
              <p className={`text-[10px] truncate ${isSelected ? "text-slate-200" : "text-slate-400"}`}>
                "{c.claim}"
              </p>
              {c.location && <p className="text-[9px] text-slate-600 truncate">{c.location}</p>}
            </div>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded uppercase ${
              c.domain === "logistics" ? "bg-violet-500/10 text-violet-400"
              : c.domain === "energy" ? "bg-amber-500/10 text-amber-400"
              : c.domain === "infrastructure" ? "bg-blue-500/10 text-blue-400"
              : "bg-slate-700/50 text-slate-500"
            }`}>
              {c.domain}
            </span>
            <ScoreBar value={c.credibilityScore} color={c.credibilityScore >= 0.6 ? "emerald" : c.credibilityScore >= 0.4 ? "amber" : "red"} />
            <ScoreBar value={c.similarity} color="cyan" />
            <span className={`text-[10px] font-mono ${isSelected ? "text-emerald-400" : "text-slate-500"}`}>
              ${c.priceUsdc?.toFixed(3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const pct = Math.round((value || 0) * 100);
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500", cyan: "bg-cyan-500",
    amber: "bg-amber-500", red: "bg-red-500",
  };
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${colorMap[color] || "bg-slate-600"}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] font-mono text-slate-500 w-6 text-right">{pct}%</span>
    </div>
  );
}

// ─────────────────────────────────────────────
// PIPELINE STEP
// ─────────────────────────────────────────────

function PipelineStep({ event, idx, expanded, onToggle, scenarioId }: {
  event: AgentEvent; idx: number; expanded: boolean; onToggle: () => void; scenarioId?: string;
}) {
  const meta = getStepMeta(event.type);
  const Icon = meta.icon;
  const isRunning = event.status === "in_progress";
  const hasData = event.data && Object.keys(event.data).length > 0;

  return (
    <div className={`rounded-xl border p-4 transition-all ${meta.bg} animate-agent-step`}
         style={{ animationDelay: `${idx * 0.06}s` }}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={`w-7 h-7 rounded-lg border flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
          {isRunning
            ? <Loader2 className={`w-3.5 h-3.5 ${meta.color} animate-spin`} />
            : <Icon className={`w-3.5 h-3.5 ${meta.color}`} />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 justify-between">
            <span className={`text-[10px] font-bold uppercase tracking-widest ${meta.color}`}>
              {event.step}
            </span>
            <span className="text-[9px] text-slate-600 font-mono flex-shrink-0">
              {new Date(event.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-300 leading-relaxed">{event.thinking}</p>
        </div>
      </div>

      {/* Rich Data Sections */}
      {event.data && event.type === "query" && (
        <div className="mt-3 ml-10 p-3 bg-slate-950/60 rounded-lg border border-slate-800/40 font-mono text-[10px] space-y-1">
          <p><span className="text-cyan-500">query</span> <span className="text-slate-300">"{event.data.query}"</span></p>
          <p><span className="text-cyan-500">domain_filter</span> <span className="text-violet-300">{event.data.domainFilter}</span></p>
          <p><span className="text-cyan-500">vector_model</span> <span className="text-slate-400">{event.data.vectorModel}</span></p>
          <p><span className="text-cyan-500">protocol</span> <span className="text-slate-400">{event.data.protocol}</span></p>
        </div>
      )}

      {event.data && event.type === "results" && event.data.candidates?.length > 0 && (
        <div className="mt-3 ml-10">
          <SearchResultsTable candidates={event.data.candidates} />
        </div>
      )}

      {event.data && event.type === "selected" && (
        <div className="mt-3 ml-10 p-3 bg-slate-950/60 rounded-lg border border-amber-500/20 text-[10px] space-y-1.5">
          <p className="text-amber-400 font-semibold">Selected Fact</p>
          <p className="text-slate-300">"{event.data.claim}"</p>
          <div className="grid grid-cols-3 gap-2 pt-1">
            <div>
              <span className="text-slate-600">Location</span>
              <p className="text-slate-300 text-[9px]">{event.data.location || "—"}</p>
            </div>
            <div>
              <span className="text-slate-600">Credibility</span>
              <p className="text-emerald-400 font-mono">{((event.data.credibilityScore || 0) * 100).toFixed(1)}%</p>
            </div>
            <div>
              <span className="text-slate-600">Price</span>
              <p className="text-emerald-400 font-mono">${event.data.priceUsdc?.toFixed(3)}</p>
            </div>
          </div>
          <p className="text-slate-500 text-[9px] italic pt-1">{event.data.selectionReason}</p>
        </div>
      )}

      {event.data && event.type === "purchasing" && event.status === "complete" && (
        <div className="mt-3 ml-10 p-3 bg-emerald-950/30 rounded-lg border border-emerald-500/20 text-[10px]">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-slate-500">Receipt</span><p className="text-emerald-400 font-mono text-[9px] truncate">{event.data.receipt}</p></div>
            <div><span className="text-slate-500">Amount Paid</span><p className="text-emerald-400 font-mono">${event.data.amountPaid?.toFixed(3)} USDC</p></div>
          </div>
        </div>
      )}

      {event.data && event.type === "streetview" && (
        <div className="mt-3 ml-10">
          <StreetViewImage lat={event.data.lat} lng={event.data.lng} location={event.data.location} scenarioId={scenarioId} />
        </div>
      )}

      {event.data && event.type === "verifying" && event.status === "complete" && event.data.geminiReasoning && (
        <div className="mt-3 ml-10 p-3 bg-pink-950/20 rounded-lg border border-pink-500/15 text-[11px] text-slate-300 leading-relaxed">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3 h-3 text-pink-400" />
            <span className="text-[9px] font-mono text-pink-400 uppercase tracking-wider">Gemini 2.5 Flash Analysis</span>
          </div>
          <p className="italic">{event.data.geminiReasoning}</p>
        </div>
      )}

      {/* Generic expand for other events */}
      {hasData && !["query","results","selected","purchasing","streetview","verifying"].includes(event.type) && (
        <div className="mt-2 ml-10">
          <button onClick={onToggle}
            className="text-[9px] text-slate-600 hover:text-slate-400 flex items-center gap-1 transition-colors cursor-pointer">
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "Show"} raw data
          </button>
          {expanded && (
            <div className="mt-1 bg-slate-950/60 rounded-lg p-2 font-mono text-[9px] text-slate-500 space-y-0.5 max-h-32 overflow-y-auto">
              {Object.entries(event.data).map(([k, v]) =>
                typeof v !== "object" ? (
                  <p key={k}><span className="text-slate-600">{k}:</span> {String(v)}</p>
                ) : null
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// STATIC DEMO IMAGE MAP
// Curated images that actually match the scenario
// ─────────────────────────────────────────────
const DEMO_IMAGES: Record<string, string> = {
  'logistics-traffic': '/demo/logistics-traffic.png',
  'energy-grid': '/demo/energy-grid.png',
};

// ─────────────────────────────────────────────
// LOCATION EVIDENCE COMPONENT
// ─────────────────────────────────────────────

function StreetViewImage({ lat, lng, location, scenarioId }: { lat: number; lng: number; location: string; scenarioId?: string }) {
  const staticImg = scenarioId ? DEMO_IMAGES[scenarioId] : null;
  const prefix = scenarioId === 'logistics-traffic' ? 'logistics' : 'energy';
  const headings = [0, 90, 180, 270];

  return (
    <div className="space-y-3">
      {/* 1. Purchased Evidence (Static Image) */}
      {staticImg && (
        <div className="rounded-xl overflow-hidden border border-violet-500/20 bg-slate-950 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-500/8 border-b border-violet-500/15">
            <MapPin className="w-3 h-3 text-violet-400" />
            <span className="text-[9px] font-mono text-violet-400 uppercase tracking-wider">Purchased Evidence</span>
            <span className="text-[9px] text-slate-500 ml-auto truncate">{location}</span>
          </div>
          <div className="relative flex-1" style={{ minHeight: "180px" }}>
            <img
              src={staticImg}
              alt={`Evidence: ${location}`}
              className="absolute inset-0 w-full h-full object-cover"
            />
          </div>
        </div>
      )}

      {/* 2. Google Street View (Live API / 4-Way Cross-Reference Grid) */}
      <div className="rounded-xl overflow-hidden border border-rose-500/20 bg-slate-950 flex flex-col">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/8 border-b border-rose-500/15">
          <MapPin className="w-3 h-3 text-rose-400" />
          <span className="text-[9px] font-mono text-rose-400 uppercase tracking-wider">
            {scenarioId === 'energy-grid' ? 'Google Street View' : 'Google Street View (4-Way Cross-Reference)'}
          </span>
          <span className="text-[9px] font-mono text-slate-600 ml-auto">{lat.toFixed(4)}, {lng.toFixed(4)}</span>
        </div>
        {scenarioId === 'energy-grid' ? (
          <div className="flex flex-col items-center justify-center bg-slate-900 border-t border-slate-800" style={{ minHeight: "180px" }}>
            <MapPin className="w-6 h-6 text-slate-600 mb-2" />
            <p className="text-[10px] text-slate-400">Street View data not available</p>
            <p className="text-[9px] text-slate-500 mt-1">Fallback: AI coherence analysis on provided evidence</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-[1px] bg-slate-800">
            {headings.map(h => (
              <div key={h} className="relative bg-slate-950" style={{ height: "130px" }}>
                <img
                  src={`/demo/sv-${prefix}-${h}.jpg`}
                  alt={`Street View ${h}°`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute top-1 left-1 bg-black/60 px-1.5 py-0.5 rounded text-[8px] font-mono text-white/80">
                  HEADING {h}°
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SETTLEMENT CARD
// ─────────────────────────────────────────────

function SettlementCard({ settlement, complete }: { settlement: AgentEvent; complete?: AgentEvent }) {
  const d = settlement.data || {};
  const isReward = d.terminalStatus === "REWARD";

  const signals = [
    { key: "s_rep", label: "Reputation", emoji: "👤", color: "violet" },
    { key: "s_stake", label: "Stake Weight", emoji: "💰", color: "emerald" },
    { key: "s_geo", label: "Geospatial", emoji: "📍", color: "cyan" },
    { key: "s_temporal", label: "Temporal", emoji: "⏱", color: "amber" },
    { key: "s_semantic", label: "Semantic", emoji: "🔤", color: "pink" },
    { key: "s_agent", label: "Agent Signal", emoji: "🤖", color: "violet" },
  ];

  return (
    <div className={`rounded-2xl border p-5 ${isReward ? "border-emerald-500/30 bg-emerald-950/20" : "border-red-500/30 bg-red-950/20"}`}>
      <div className="flex items-center gap-3 mb-4">
        {isReward
          ? <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          : <Flame className="w-8 h-8 text-red-400" />}
        <div>
          <p className={`text-2xl font-black ${isReward ? "text-emerald-400" : "text-red-400"}`}>
            {isReward ? "STAKE RELEASED" : "STAKE SLASHED"}
          </p>
          <p className="text-xs text-slate-500">
            Terminal Score: <span className="font-mono text-slate-300">{((d.terminalScore || 0) * 100).toFixed(1)}%</span>
            {" · "}Stake: <span className="font-mono text-slate-300">${d.stakeAmount?.toFixed(2)} USDC</span>
          </p>
        </div>
        {d.settlementTxHash && (
          <a href={`https://sepolia.basescan.org/tx/${d.settlementTxHash}`}
            target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-[10px] text-cyan-400 hover:underline">
            View TX <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>

      {/* Signal breakdown */}
      {d.signals && (
        <div className="space-y-2">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-2">6-Signal Bayesian Breakdown</p>
          {signals.map(s => {
            const val = (d.signals[s.key] || 0) * 100;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span className="text-[11px] w-20 text-slate-500">{s.emoji} {s.label}</span>
                <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${
                      s.color === "emerald" ? "from-emerald-600 to-emerald-400"
                      : s.color === "cyan" ? "from-cyan-600 to-cyan-400"
                      : s.color === "amber" ? "from-amber-600 to-amber-400"
                      : s.color === "pink" ? "from-pink-600 to-pink-400"
                      : "from-violet-600 to-violet-400"
                    }`}
                    style={{ width: `${val}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-400 w-8 text-right">{val.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      )}


    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────

export default function AgentDemoPage() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenario, setActiveScenario] = useState<string>("logistics-traffic");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load scenarios
  useEffect(() => {
    fetch(`${API}/agent/scenarios`)
      .then(r => r.json())
      .then(d => setScenarios(d.scenarios || []))
      .catch(() => {});
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const runSimulation = useCallback((scenarioId: string) => {
    if (running) return;
    esRef.current?.close();

    setRunning(true);
    setDone(false);
    setEvents([]);
    setExpandedIdx(null);

    const es = new EventSource(`${API}/agent/simulate/${scenarioId}`);
    esRef.current = es;

    es.onmessage = (e) => {
      if (e.data === "[DONE]") {
        es.close();
        setRunning(false);
        setDone(true);
        return;
      }
      try {
        const event: AgentEvent = JSON.parse(e.data);
        setEvents(prev => {
          // Replace in-progress with completed for same step
          const last = prev[prev.length - 1];
          if (last?.step === event.step && last.status === "in_progress" && event.status !== "in_progress") {
            return [...prev.slice(0, -1), event];
          }
          return [...prev, event];
        });
      } catch {}
    };

    es.onerror = () => {
      es.close();
      setRunning(false);
    };
  }, [running]);

  useEffect(() => () => { esRef.current?.close(); }, []);

  const handleScenarioClick = (id: string) => {
    if (running) return;
    setActiveScenario(id);
    setEvents([]);
    setDone(false);
  };

  const activeScenarioData = scenarios.find(s => s.id === activeScenario);
  const settlementEvent = events.find(e => e.type === "settlement" && e.status === "complete");
  const completeEvent = events.find(e => e.type === "complete");
  const hasStarted = events.length > 0;

  const isLogistics = activeScenario === "logistics-traffic";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* NAV */}
      <nav className="border-b border-slate-800/60 px-6 py-3 flex items-center justify-between sticky top-0 z-50 bg-slate-950/95 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Link>
          <span className="text-slate-700">/</span>
          <span className="text-sm font-semibold text-slate-300">Agentic AI Demo</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest">Aperture Protocol Live</span>
        </div>
      </nav>

      {/* HERO */}
      <div className="px-8 pt-8 pb-6 border-b border-slate-800/40">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/20 flex items-center justify-center">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-widest">Aperture Protocol — Agentic AI Consumer</span>
              </div>
              <h1 className="text-3xl font-black text-white tracking-tight">
                Watch Autonomous AI <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-violet-400">Buy & Verify</span> Intelligence
              </h1>
              <p className="mt-2 text-slate-400 text-sm max-w-2xl">
                AI agents autonomously search, purchase via HTTP 402 (x402 protocol), verify with Gemini AI, and trigger cryptographic settlement — all on Base Sepolia. Full transparency. No middlemen.
              </p>
            </div>
            <div className="hidden lg:flex flex-col items-end gap-1">
              <div className="flex items-center gap-4 text-[10px] text-slate-500">
                <div className="flex items-center gap-1"><Shield className="w-3 h-3 text-emerald-500/60" /> Trustless verification</div>
                <div className="flex items-center gap-1"><TrendingUp className="w-3 h-3 text-cyan-500/60" /> Game theory incentives</div>
                <div className="flex items-center gap-1"><Globe className="w-3 h-3 text-violet-500/60" /> On-chain settlement</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 px-8 py-6 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT: Scenario selector + controls */}
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest mb-3">
                Select Agent Scenario
              </p>
              <div className="space-y-3">
                {scenarios.map(s => (
                  <ScenarioCard
                    key={s.id}
                    scenario={s}
                    active={activeScenario === s.id}
                    running={running}
                    onClick={() => handleScenarioClick(s.id)}
                  />
                ))}
                {scenarios.length === 0 && (
                  <div className="rounded-xl border border-slate-800 p-4 text-center text-sm text-slate-600">
                    Loading scenarios...
                  </div>
                )}
              </div>
            </div>

            {/* RUN BUTTON */}
            <button
              onClick={() => runSimulation(activeScenario)}
              disabled={running || !activeScenario}
              className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                running
                  ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                  : isLogistics
                    ? "bg-gradient-to-r from-violet-600 to-violet-500 text-white hover:from-violet-500 hover:to-violet-400 shadow-lg shadow-violet-500/20"
                    : "bg-gradient-to-r from-amber-600 to-amber-500 text-white hover:from-amber-500 hover:to-amber-400 shadow-lg shadow-amber-500/20"
              }`}
            >
              {running ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Agent Running...</>
              ) : done ? (
                <><Activity className="w-4 h-4" /> Run Again</>
              ) : (
                <><Bot className="w-4 h-4" /> Launch {activeScenarioData?.agentName || "Agent"}</>
              )}
            </button>

            {/* Agent Identity Card (shows when running or done) */}
            {hasStarted && activeScenarioData && (
              <div className={`rounded-xl border p-4 ${
                isLogistics ? "border-violet-500/20 bg-violet-500/5" : "border-amber-500/20 bg-amber-500/5"
              }`}>
                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">Active Agent</p>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">{activeScenarioData.agentEmoji}</span>
                  <div>
                    <p className={`text-sm font-bold ${isLogistics ? "text-violet-300" : "text-amber-300"}`}>
                      {activeScenarioData.agentName}
                    </p>
                    <p className="text-[10px] text-slate-500">{activeScenarioData.agentRole}</p>
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{activeScenarioData.businessContext}</p>
                <div className="mt-2 pt-2 border-t border-slate-800/40">
                  <p className="text-[9px] text-slate-600 font-mono">
                    📍 {activeScenarioData.streetViewLocation}
                  </p>
                </div>
              </div>
            )}

            {/* Protocol stats */}
            <div className="rounded-xl border border-slate-800/40 bg-slate-900/40 p-4 space-y-2">
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Protocol Stack</p>
              {[
                { label: "Payment Layer", value: "x402 (HTTP 402)" },
                { label: "Settlement Chain", value: "Base Sepolia" },
                { label: "Verification AI", value: "Gemini 2.5 Flash" },
                { label: "Embedding Model", value: "all-MiniLM-L6-v2" },
                { label: "Credibility Engine", value: "6-Signal Bayesian" },
              ].map(r => (
                <div key={r.label} className="flex justify-between text-[10px]">
                  <span className="text-slate-600">{r.label}</span>
                  <span className="text-slate-400 font-mono">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CENTER + RIGHT: Pipeline */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                Live Agent Pipeline
              </p>
              {running && (
                <div className={`flex items-center gap-1.5 text-[10px] ${isLogistics ? "text-violet-400" : "text-amber-400"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${isLogistics ? "bg-violet-400" : "bg-amber-400"}`} />
                  Streaming live events...
                </div>
              )}
            </div>

            {!hasStarted && (
              <div className="rounded-2xl border border-slate-800/40 bg-slate-900/20 h-80 flex flex-col items-center justify-center gap-4 text-center px-8">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/10 to-cyan-600/10 border border-slate-800 flex items-center justify-center">
                  <Bot className="w-8 h-8 text-slate-600" />
                </div>
                <div>
                  <p className="text-slate-400 font-medium">Agent Waiting</p>
                  <p className="text-[11px] text-slate-600 mt-1 max-w-xs">
                    Select a scenario and click <span className={isLogistics ? "text-violet-400" : "text-amber-400"}>Launch Agent</span> to watch the autonomous AI lifecycle unfold in real-time.
                  </p>
                </div>
              </div>
            )}

            {/* Event log */}
            <div ref={scrollRef} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              {events.map((event, idx) => (
                <PipelineStep
                  key={`${idx}-${event.type}-${event.status}`}
                  event={event}
                  idx={idx}
                  expanded={expandedIdx === idx}
                  onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  scenarioId={activeScenario}
                />
              ))}
            </div>

            {/* Final settlement card */}
            {settlementEvent && done && (
              <SettlementCard settlement={settlementEvent} complete={completeEvent} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
