 "use client";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { ShieldCheck } from "lucide-react";

const data = [
  { subject: "Reputation", A: 85, fullMark: 100 },
  { subject: "Stake", A: 90, fullMark: 100 },
  { subject: "Geo-Spread", A: 70, fullMark: 100 },
  { subject: "Temporal", A: 80, fullMark: 100 },
  { subject: "Agent Trust", A: 65, fullMark: 100 },
  { subject: "Semantic Var", A: 95, fullMark: 100 },
];

export default function CredibilityRadar() {
  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-2xl">
      <div className="flex items-center mb-4">
        <ShieldCheck className="w-5 h-5 text-cyan-400 mr-2" />
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">Epistemic Consensus</h2>
        <div className="ml-auto text-xs bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded-md font-bold">
          SCORE: 81%
        </div>
      </div>
      <div className="flex-1 w-full min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
            <PolarGrid stroke="#334155" />
            <PolarAngleAxis dataKey="subject" tick={{ fill: '#94a3b8', fontSize: 10 }} />
            <Radar name="Fact Credibility" dataKey="A" stroke="#22d3ee" fill="#22d3ee" fillOpacity={0.3} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}