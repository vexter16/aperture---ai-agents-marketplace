"use client";
import { useState, useEffect, useRef } from "react";
import {
  Scan, MapPin, Brain, CheckCircle2, XCircle, AlertTriangle,
  Clock, Cpu, Compass, ShieldCheck, ShieldX, Home, Moon, Camera,
  CloudRain, HardHat, Globe, EyeOff, Info
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const DIRECTION_LABELS = ["North", "East", "South", "West"];

interface CoherenceData {
  coherent: boolean;
  confidence: number;
  reasoning: string;
  text_match: boolean;
  domain_match: boolean;
  location_plausible: boolean;
  verification_mode: string;
  streetViewUrls?: string[];
  geminiReasoning?: string;
  geminiModel?: string;
  latencyMs?: number;
}

interface HeuristicData {
  enabled: boolean;
  signals: {
    s_rep: number;
    s_stake: number;
    s_geo: number;
    s_temporal: number;
    s_semantic: number;
  };
  finalScore: number;
  status: string;
}

export interface VerificationData {
  coherence: CoherenceData | null;
  heuristic: HeuristicData | null;
  // Extended fields from /verification/latest
  outcome?: "accepted" | "rejected" | "skipped";
  textClaim?: string;
  domain?: string;
  edgeCases?: string[];
  timestamp?: string;
}

interface Props {
  data: VerificationData | null;
  factId?: string | null;
  onNewVerification?: (data: VerificationData) => void;
}

// ─── Edge Case Badge Config ───
const EDGE_CASE_CONFIG: Record<string, { icon: React.ReactNode; label: string; explanation: string; color: string }> = {
  "indoor": {
    icon: <Home className="w-3 h-3" />,
    label: "Indoor",
    explanation: "Photo appears to be taken indoors — Street View cannot verify indoor locations",
    color: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  },
  "close-up": {
    icon: <Camera className="w-3 h-3" />,
    label: "Close-up",
    explanation: "Close-up/macro photo detected — geographic features not visible for comparison",
    color: "bg-violet-500/15 text-violet-400 border-violet-500/20",
  },
  "night": {
    icon: <Moon className="w-3 h-3" />,
    label: "Night/Low-light",
    explanation: "Photo taken in low-light conditions — visual comparison focuses on permanent structures",
    color: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",
  },
  "weather": {
    icon: <CloudRain className="w-3 h-3" />,
    label: "Weather Diff",
    explanation: "Weather conditions differ from Street View — analysis ignores temporary weather effects",
    color: "bg-sky-500/15 text-sky-400 border-sky-500/20",
  },
  "construction": {
    icon: <HardHat className="w-3 h-3" />,
    label: "Temporal Change",
    explanation: "New construction or demolition detected — Street View may be outdated",
    color: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  },
  "generic-scene": {
    icon: <Globe className="w-3 h-3" />,
    label: "Generic Scene",
    explanation: "Scene is not geographically distinctive — location cannot be verified from image alone",
    color: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  },
  "sv-not-applicable": {
    icon: <EyeOff className="w-3 h-3" />,
    label: "SV N/A",
    explanation: "Street View comparison not applicable for this photo type",
    color: "bg-rose-500/15 text-rose-400 border-rose-500/20",
  },
};

function CheckBadge({ pass, label }: { pass: boolean; label: string }) {
  return (
    <span className={`verification-badge ${pass ? "verification-pass" : "verification-fail"} inline-flex items-center gap-1`}>
      {pass ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
      {label}
    </span>
  );
}

function SignalBar({ label, value, icon }: { label: string; value: number; icon: string }) {
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-16 shrink-0">{icon} {label}</span>
      <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-slate-400 font-mono w-8 text-right">{pct}%</span>
    </div>
  );
}

function EdgeCaseBadge({ caseKey }: { caseKey: string }) {
  const config = EDGE_CASE_CONFIG[caseKey];
  if (!config) return null;
  const [showTip, setShowTip] = useState(false);

  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShowTip(true)}
        onMouseLeave={() => setShowTip(false)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${config.color} cursor-help transition-colors`}
      >
        {config.icon}
        {config.label}
        <Info className="w-2.5 h-2.5 opacity-60" />
      </button>
      {showTip && (
        <div className="absolute z-50 bottom-full left-0 mb-1.5 w-52 bg-slate-900 border border-slate-700 rounded-lg p-2 text-[10px] text-slate-400 leading-relaxed shadow-xl">
          {config.explanation}
        </div>
      )}
    </div>
  );
}

export default function VerificationViewer({ data, factId, onNewVerification }: Props) {
  const [loadedData, setLoadedData] = useState<VerificationData | null>(null);
  const lastTimestampRef = useRef<string | null>(null);

  // Poll /verification/latest every 3 seconds to pick up Flutter submissions
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`${API}/verification/latest`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.verification && json.verification.timestamp !== lastTimestampRef.current) {
          lastTimestampRef.current = json.verification.timestamp;
          const newData: VerificationData = {
            coherence: json.verification.coherence,
            heuristic: json.verification.heuristic,
            outcome: json.verification.outcome,
            textClaim: json.verification.textClaim,
            domain: json.verification.domain,
            edgeCases: json.verification.edgeCases,
            timestamp: json.verification.timestamp,
          };
          setLoadedData(newData);
          onNewVerification?.(newData);
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    poll(); // immediate first fetch
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [onNewVerification]);

  // If factId is provided and no live data, fetch from DB
  useEffect(() => {
    if (data || loadedData) return;
    if (factId) {
      fetch(`${API}/facts/${factId}/verification`)
        .then(r => r.json())
        .then(d => {
          if (d.verification) {
            setLoadedData({
              coherence: d.verification.coherence,
              heuristic: d.verification.heuristic,
              edgeCases: d.verification.edgeCases,
            });
          }
        })
        .catch(() => {});
    }
  }, [data, factId, loadedData]);

  // Priority: live data from web submit > polled data > factId-fetched data
  const displayData = data || loadedData;

  if (!displayData) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-600 text-sm gap-2">
        <Scan className="w-8 h-8 text-slate-700" />
        <p className="text-center">Submit a fact from the app or web dashboard to see the verification pipeline</p>
        <p className="text-[10px] text-slate-700">Auto-refreshes every 3 seconds</p>
      </div>
    );
  }

  const { coherence, heuristic, outcome, textClaim, domain, edgeCases } = displayData;

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto animate-fade-in-up pr-1">
      {/* ── Section 0: Verdict Header ── */}
      {outcome && (
        <div className={`rounded-lg p-3 flex items-start gap-2.5 border ${
          outcome === 'rejected'
            ? 'bg-red-500/8 border-red-500/20'
            : outcome === 'accepted'
            ? 'bg-emerald-500/8 border-emerald-500/20'
            : 'bg-amber-500/8 border-amber-500/20'
        }`}>
          {outcome === 'rejected' ? (
            <ShieldX className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          ) : outcome === 'accepted' ? (
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-xs font-bold uppercase tracking-wide ${
                outcome === 'rejected' ? 'text-red-400' :
                outcome === 'accepted' ? 'text-emerald-400' : 'text-amber-400'
              }`}>
                {outcome === 'rejected' ? 'EVIDENCE REJECTED' :
                 outcome === 'accepted' ? 'EVIDENCE ACCEPTED' : 'VERIFICATION SKIPPED'}
              </span>
              {domain && (
                <span className="text-[9px] px-1.5 py-0.5 bg-slate-800 text-slate-500 rounded font-mono uppercase">
                  {domain}
                </span>
              )}
            </div>
            {textClaim && (
              <p className="text-[11px] text-slate-400 leading-relaxed truncate">
                &ldquo;{textClaim}&rdquo;
              </p>
            )}
            {displayData.timestamp && (
              <p className="text-[9px] text-slate-600 mt-1 font-mono">
                {new Date(displayData.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Edge Cases Detected ── */}
      {edgeCases && edgeCases.length > 0 && (
        <div>
          <p className="text-[10px] text-slate-500 mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            Edge Cases Detected
          </p>
          <div className="flex gap-1.5 flex-wrap">
            {edgeCases.map(c => (
              <EdgeCaseBadge key={c} caseKey={c} />
            ))}
          </div>
        </div>
      )}

      {/* ── Section 1: Image Verification ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-3.5 h-3.5 text-cyan-400" />
          <h3 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Image Verification</h3>
          {coherence && (
            <span className={`verification-badge ml-auto ${
              coherence.verification_mode === 'skipped' ? 'verification-skip' :
              coherence.coherent ? 'verification-pass' : 'verification-fail'
            }`}>
              {coherence.verification_mode === 'skipped' ? 'SKIPPED' :
               coherence.verification_mode === 'streetview-360' ? '360° STREET VIEW' : 'ZERO-SHOT'}
            </span>
          )}
        </div>

        {!coherence || coherence.verification_mode === 'skipped' ? (
          <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/30">
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              {coherence?.reasoning || 'Image verification was skipped (no image attached or toggle OFF)'}
            </p>
          </div>
        ) : (
          <>
            {/* 3-Check breakdown */}
            <div className="flex gap-1.5 mb-2 flex-wrap">
              <CheckBadge pass={coherence.text_match} label="Text" />
              <CheckBadge pass={coherence.domain_match} label="Domain" />
              <CheckBadge pass={coherence.location_plausible} label="Location" />
            </div>

            {/* Street View Images (2x2 grid) */}
            {coherence.streetViewUrls && coherence.streetViewUrls.length > 0 && (
              <div className="mb-2">
                <p className="text-[10px] text-slate-500 mb-1 flex items-center gap-1">
                  <Compass className="w-3 h-3" /> Street View — 4 Directions
                </p>
                <div className="sv-grid">
                  {coherence.streetViewUrls.map((url, i) => (
                    <div key={i} className="relative rounded overflow-hidden border border-slate-700/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`Street View ${DIRECTION_LABELS[i]}`}
                        className="w-full h-auto object-cover"
                        loading="lazy"
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-slate-950/80 text-[9px] text-slate-400 text-center py-0.5 font-mono">
                        {DIRECTION_LABELS[i]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gemini Analysis */}
            <div className="bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/30">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Cpu className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] font-medium text-slate-300">Gemini Analysis</span>
                {coherence.geminiModel && (
                  <span className="text-[9px] text-slate-600 font-mono ml-auto">{coherence.geminiModel}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed italic">
                &quot;{coherence.geminiReasoning || coherence.reasoning}&quot;
              </p>
              <div className="flex gap-3 mt-1.5 text-[9px] text-slate-600">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {coherence.latencyMs ? `${coherence.latencyMs}ms` : '—'}
                </span>
                <span>Confidence: {(coherence.confidence * 100).toFixed(0)}%</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: Heuristic Engine ── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Brain className="w-3.5 h-3.5 text-cyan-400" />
          <h3 className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">Heuristic Engine</h3>
          {heuristic && (
            <span className={`verification-badge ml-auto ${
              !heuristic.enabled ? 'verification-skip' :
              heuristic.status === 'APPROVED_FOR_MARKET' ? 'verification-pass' :
              heuristic.status === 'REJECTED_SYBIL_SUSPECT' ? 'verification-fail' :
              'bg-amber-500/15 text-amber-400 border border-amber-500/20'
            }`}>
              {!heuristic.enabled ? 'SKIPPED' : heuristic.status.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {!heuristic || !heuristic.enabled ? (
          <div className="bg-slate-800/40 rounded-lg p-3 border border-slate-700/30">
            <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              {outcome === 'rejected'
                ? 'Heuristic engine was not run (submission rejected at image verification stage)'
                : 'Heuristic engine was skipped — fixed score of 50% used'}
            </p>
          </div>
        ) : (
          <>
            {/* Score Display */}
            {heuristic.finalScore !== undefined && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-slate-500">Score:</span>
                <span className={`text-sm font-bold font-mono ${
                  heuristic.finalScore >= 0.7 ? 'text-emerald-400' :
                  heuristic.finalScore >= 0.4 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {(heuristic.finalScore * 100).toFixed(1)}%
                </span>
              </div>
            )}

            {/* Signal Bars */}
            <div className="flex flex-col gap-1.5 bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/30">
              <SignalBar label="Rep" value={heuristic.signals.s_rep} icon="👤" />
              <SignalBar label="Stake" value={heuristic.signals.s_stake} icon="💰" />
              <SignalBar label="Geo" value={heuristic.signals.s_geo} icon="📍" />
              <SignalBar label="Time" value={heuristic.signals.s_temporal} icon="⏱" />
              <SignalBar label="Sem" value={heuristic.signals.s_semantic} icon="🔤" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
