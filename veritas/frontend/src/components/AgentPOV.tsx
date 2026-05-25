"use client";
import { useState, useRef, useEffect } from "react";
import {
  Bot, Search, ShieldCheck, CreditCard, Brain, Scale, CheckCircle2,
  XCircle, Flame, ChevronDown, ChevronUp, Loader2, Zap
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

interface AgentEvent {
  step: string;
  type: 'init' | 'searching' | 'evaluating' | 'purchasing' | 'verifying' | 'feedback' | 'settlement' | 'complete' | 'error' | 'no_facts';
  status: 'in_progress' | 'complete' | 'error';
  thinking: string;
  data?: Record<string, any>;
  timestamp: string;
}

interface AgentPOVProps {
  onRunAgent?: () => void;
  isRunning: boolean;
  setIsRunning: (v: boolean) => void;
}

// ─────────────────────────────────────────────
// STEP ICON MAPPING
// ─────────────────────────────────────────────

function getStepIcon(type: string, status: string) {
  const baseClass = "w-4 h-4 shrink-0";
  if (status === 'in_progress') return <Loader2 className={`${baseClass} text-violet-400 animate-spin`} />;
  if (status === 'error') return <XCircle className={`${baseClass} text-red-400`} />;

  switch (type) {
    case 'init': return <Bot className={`${baseClass} text-violet-400`} />;
    case 'searching': return <Search className={`${baseClass} text-cyan-400`} />;
    case 'evaluating': return <ShieldCheck className={`${baseClass} text-amber-400`} />;
    case 'purchasing': return <CreditCard className={`${baseClass} text-emerald-400`} />;
    case 'verifying': return <Brain className={`${baseClass} text-pink-400`} />;
    case 'feedback': return <Scale className={`${baseClass} text-orange-400`} />;
    case 'settlement': return <Zap className={`${baseClass} text-yellow-400`} />;
    case 'complete': return <CheckCircle2 className={`${baseClass} text-emerald-400`} />;
    case 'no_facts': return <Search className={`${baseClass} text-slate-500`} />;
    default: return <Bot className={`${baseClass} text-violet-400`} />;
  }
}

function getStepColor(type: string, status: string) {
  if (status === 'error') return 'border-red-500/30 bg-red-500/5';
  if (status === 'in_progress') return 'border-violet-500/30 bg-violet-500/5';

  switch (type) {
    case 'init': return 'border-violet-500/20 bg-violet-500/5';
    case 'searching': return 'border-cyan-500/20 bg-cyan-500/5';
    case 'evaluating': return 'border-amber-500/20 bg-amber-500/5';
    case 'purchasing': return 'border-emerald-500/20 bg-emerald-500/5';
    case 'verifying': return 'border-pink-500/20 bg-pink-500/5';
    case 'feedback': return 'border-orange-500/20 bg-orange-500/5';
    case 'settlement': return 'border-yellow-500/20 bg-yellow-500/5';
    case 'complete': return 'border-emerald-500/20 bg-emerald-500/5';
    default: return 'border-slate-700/50 bg-slate-800/30';
  }
}

// ─────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────

export default function AgentPOV({ isRunning, setIsRunning }: AgentPOVProps) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [hasRun, setHasRun] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  // Start the SSE stream
  const startSimulation = () => {
    if (isRunning) return;

    setIsRunning(true);
    setHasRun(true);
    setEvents([]);
    setExpandedIdx(null);

    const es = new EventSource(`${API}/agent/simulate`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      if (e.data === '[DONE]') {
        es.close();
        setIsRunning(false);
        return;
      }

      try {
        const event: AgentEvent = JSON.parse(e.data);
        setEvents(prev => {
          // Replace the last event if it has the same step and was in_progress
          const last = prev[prev.length - 1];
          if (last && last.step === event.step && last.status === 'in_progress' && event.status !== 'in_progress') {
            return [...prev.slice(0, -1), event];
          }
          return [...prev, event];
        });
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      setIsRunning(false);
    };
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return ''; }
  };

  // Get the settlement event if it exists
  const settlementEvent = events.find(e => e.type === 'settlement');
  const completionEvent = events.find(e => e.type === 'complete');

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Agent Identity Header */}
      <div className="px-3 py-2 border-b border-slate-800/60 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600/30 to-purple-600/30 border border-violet-500/20 flex items-center justify-center">
            <Bot className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div>
            <p className="text-[11px] font-semibold text-violet-300">LogiScan AI</p>
            <p className="text-[9px] text-slate-500">Fleet Routing Intelligence</p>
          </div>
        </div>

        <button
          onClick={startSimulation}
          disabled={isRunning}
          className={`text-[10px] font-mono px-2.5 py-1 rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
            isRunning
              ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
              : 'bg-violet-600/20 text-violet-300 border border-violet-500/30 hover:bg-violet-600/30 hover:border-violet-500/40'
          }`}
        >
          {isRunning ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              RUNNING...
            </>
          ) : (
            <>
              <Zap className="w-3 h-3" />
              {hasRun ? 'RE-RUN' : 'RUN AGENT'}
            </>
          )}
        </button>
      </div>

      {/* Event Log */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {!hasRun && events.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600/15 to-purple-600/15 border border-violet-500/15 flex items-center justify-center">
              <Bot className="w-6 h-6 text-violet-500/50" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Agent Idle</p>
              <p className="text-[10px] text-slate-600 mt-1 max-w-[200px]">
                Click <span className="text-violet-400">RUN AGENT</span> to simulate an autonomous AI buying intelligence from the marketplace.
              </p>
            </div>
          </div>
        )}

        {events.map((event, idx) => (
          <div
            key={`${idx}-${event.type}-${event.status}`}
            className={`rounded-lg border p-2 animate-agent-step ${getStepColor(event.type, event.status)}`}
            style={{ animationDelay: `${idx * 0.05}s` }}
          >
            {/* Step Header */}
            <div className="flex items-start gap-2">
              {getStepIcon(event.type, event.status)}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 justify-between">
                  <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
                    {event.step}
                  </span>
                  <span className="text-[9px] text-slate-600 font-mono shrink-0">
                    {formatTime(event.timestamp)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  {event.thinking}
                </p>
              </div>
            </div>

            {/* Expandable Data */}
            {event.data && Object.keys(event.data).length > 0 && (
              <div className="mt-1.5">
                <button
                  onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
                  className="text-[9px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  {expandedIdx === idx ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expandedIdx === idx ? 'Hide' : 'Show'} details
                </button>

                {expandedIdx === idx && (
                  <div className="mt-1.5 bg-slate-950/50 rounded-md p-2 text-[10px] font-mono text-slate-500 space-y-0.5 max-h-40 overflow-y-auto">
                    {renderEventData(event)}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Settlement Summary Card */}
        {settlementEvent && completionEvent && !isRunning && (
          <div className={`rounded-xl border p-3 mt-2 animate-agent-step ${
            settlementEvent.data?.terminalStatus === 'REWARD'
              ? 'border-emerald-500/30 bg-emerald-500/5'
              : 'border-red-500/30 bg-red-500/5'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {settlementEvent.data?.terminalStatus === 'REWARD' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : (
                <Flame className="w-5 h-5 text-red-400" />
              )}
              <span className={`text-sm font-bold ${
                settlementEvent.data?.terminalStatus === 'REWARD' ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {settlementEvent.data?.terminalStatus === 'REWARD' ? 'STAKE RELEASED' : 'STAKE SLASHED'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
              <div className="text-slate-500">Terminal Score</div>
              <div className="text-slate-300 font-mono">
                {((settlementEvent.data?.terminalScore || 0) * 100).toFixed(1)}%
              </div>
              <div className="text-slate-500">Stake Amount</div>
              <div className="text-slate-300 font-mono">
                ${(settlementEvent.data?.stakeAmount || 0).toFixed(2)} USDC
              </div>
              {settlementEvent.data?.settlementTxHash && (
                <>
                  <div className="text-slate-500">TX Hash</div>
                  <a
                    href={`https://sepolia.basescan.org/tx/${settlementEvent.data.settlementTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 font-mono hover:underline truncate"
                  >
                    {settlementEvent.data.settlementTxHash.substring(0, 16)}...
                  </a>
                </>
              )}
            </div>

            {/* Signal Breakdown */}
            {settlementEvent.data?.signals && (
              <div className="mt-2 pt-2 border-t border-slate-800/40">
                <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Signal Breakdown</p>
                <div className="grid grid-cols-3 gap-1">
                  {[
                    { key: 's_rep', label: '👤 Rep', color: 'text-violet-400' },
                    { key: 's_stake', label: '💰 Stake', color: 'text-emerald-400' },
                    { key: 's_geo', label: '📍 Geo', color: 'text-cyan-400' },
                    { key: 's_temporal', label: '⏱ Time', color: 'text-amber-400' },
                    { key: 's_semantic', label: '🔤 Sem', color: 'text-pink-400' },
                    { key: 's_agent', label: '🤖 Agent', color: 'text-violet-400' },
                  ].map(s => (
                    <div key={s.key} className="text-[9px]">
                      <span className="text-slate-500">{s.label}</span>
                      <span className={`ml-1 font-mono ${s.color}`}>
                        {((settlementEvent.data?.signals?.[s.key] || 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DATA RENDERER
// ─────────────────────────────────────────────

function renderEventData(event: AgentEvent) {
  const d = event.data;
  if (!d) return null;

  // Special rendering for verification step
  if (event.type === 'verifying' && d.geminiReasoning) {
    return (
      <div className="space-y-1">
        <p className="text-slate-400">
          <span className="text-pink-400/70">Gemini:</span> {d.geminiReasoning}
        </p>
        <p><span className="text-slate-600">verdict:</span> <span className={d.verdict === 'confirmed' ? 'text-emerald-400' : 'text-red-400'}>{d.verdict}</span></p>
        <p><span className="text-slate-600">model:</span> {d.model}</p>
        <p><span className="text-slate-600">confidence_threshold:</span> {d.confidenceThreshold}</p>
      </div>
    );
  }

  // Special rendering for search results
  if (event.type === 'searching' && d.results) {
    return (
      <div className="space-y-1">
        <p><span className="text-slate-600">results:</span> {d.resultCount}</p>
        {d.results.map((r: any, i: number) => (
          <div key={i} className="pl-2 border-l border-slate-800">
            <p className="text-slate-400 truncate">&quot;{r.claim}&quot;</p>
            <p className="text-slate-600">{r.domain} • score: {(r.score * 100).toFixed(0)}%</p>
          </div>
        ))}
      </div>
    );
  }

  // Default: render as key-value pairs
  return (
    <div className="space-y-0.5">
      {Object.entries(d).map(([key, val]) => {
        if (typeof val === 'object' && val !== null) return null;
        return (
          <p key={key}>
            <span className="text-slate-600">{key}:</span>{' '}
            <span className="text-slate-400">{String(val)}</span>
          </p>
        );
      })}
    </div>
  );
}
