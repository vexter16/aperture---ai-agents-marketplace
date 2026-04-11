"use client";
import { useEffect, useState } from "react";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { ShieldCheck, Loader2 } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface RadarProps {
  factId: string | null;
  factClaim: string | null;
}

export default function CredibilityRadar({ factId, factClaim }: RadarProps) {
  const [signals, setSignals] = useState<any>(null);
  const [score, setScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!factId) { setSignals(null); setScore(null); return; }

    setLoading(true);
    fetch(`${API}/facts/${factId}/signals`)
      .then(res => res.json())
      .then(data => {
        if (data.signals) {
          setSignals(data.signals);
          setScore(data.credibility_score);
        }
      })
      .catch(() => setSignals(null))
      .finally(() => setLoading(false));
  }, [factId]);

  const chartData = signals ? [
    { subject: "Reputation", value: Math.round((signals.s_rep ?? 0.5) * 100) },
    { subject: "Stake", value: Math.round((signals.s_stake ?? 0.5) * 100) },
    { subject: "Geo-Spread", value: Math.round((signals.s_geo ?? 0.5) * 100) },
    { subject: "Temporal", value: Math.round((signals.s_temporal ?? 0.5) * 100) },
    { subject: "Semantic", value: Math.round((signals.s_semantic ?? 0.5) * 100) },
  ] : null;

  const scoreColor = score !== null
    ? score >= 0.7 ? "text-emerald-400" : score >= 0.5 ? "text-amber-400" : "text-red-400"
    : "text-slate-500";

  const scoreBg = score !== null
    ? score >= 0.7 ? "bg-emerald-500/10" : score >= 0.5 ? "bg-amber-500/10" : "bg-red-500/10"
    : "bg-slate-800";

  return (
    <div className="glass-card flex flex-col h-full p-4">
      <div className="flex items-center mb-2">
        <ShieldCheck className="w-5 h-5 text-cyan-400 mr-2" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Credibility Analysis</h2>
        {score !== null && (
          <div className={`ml-auto stat-badge ${scoreBg} ${scoreColor} font-bold`}>
            {(score * 100).toFixed(1)}%
          </div>
        )}
      </div>

      {factClaim && (
        <p className="text-xs text-slate-400 mb-2 line-clamp-2 italic">&quot;{factClaim}&quot;</p>
      )}

      {!factId && (
        <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
          Select a fact on the map to inspect its credibility signals
        </div>
      )}

      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
        </div>
      )}

      {chartData && !loading && (
        <div className="flex-1 w-full min-h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="68%" data={chartData}>
              <PolarGrid stroke="#334155" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Radar name="Signals" dataKey="value" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.25} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}