"use client";
import { useEffect, useState, useRef } from "react";
import { Terminal, CircleAlert, CheckCircle2, Flame } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ActivityItem {
  id: string;
  text_claim: string;
  domain: string;
  credibility_score: number;
  stake_status: string;
  stake_amount: number;
  submitted_at: string;
  consumed_count: number;
  wallet_address: string;
  reputation_score: number;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export default function AgentTerminal() {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchActivity = () => {
      fetch(`${API}/activity`)
        .then(res => res.json())
        .then(data => { setActivity(data.activity || []); setError(false); })
        .catch(() => setError(true));
    };
    fetchActivity();
    const interval = setInterval(fetchActivity, 8000);
    return () => clearInterval(interval);
  }, []);

  const getStatusIcon = (status: string, score: number) => {
    if (status === 'released') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    if (status === 'slashed') return <Flame className="w-3.5 h-3.5 text-red-400 shrink-0" />;
    if (score >= 0.7) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />;
    return <CircleAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  };

  const getStatusColor = (status: string, score: number) => {
    if (status === 'released') return 'text-emerald-400';
    if (status === 'slashed') return 'text-red-400';
    if (score >= 0.7) return 'text-slate-300';
    return 'text-amber-400';
  };

  return (
    <div className="glass-card flex flex-col h-full overflow-hidden">
      <div className="flex items-center px-4 py-3 border-b border-slate-800/60">
        <Terminal className="w-4 h-4 text-emerald-400 mr-2" />
        <h2 className="text-sm font-semibold text-slate-200 tracking-wide uppercase">Live Activity</h2>
        <span className="ml-auto flex h-2 w-2 relative">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${error ? 'bg-red-400' : 'bg-emerald-400'} opacity-75`}></span>
          <span className={`relative inline-flex rounded-full h-2 w-2 ${error ? 'bg-red-500' : 'bg-emerald-500'}`}></span>
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 p-3 overflow-y-auto space-y-2 font-mono text-xs">
        {error && (
          <div className="text-red-400/80 text-center py-4">
            ⚠️ Backend offline — start server with <span className="text-cyan-400">npm run dev</span>
          </div>
        )}

        {!error && activity.length === 0 && (
          <div className="text-slate-600 text-center py-8">
            No activity yet. Submit a fact to get started.
          </div>
        )}

        {activity.map((item, i) => (
          <div
            key={item.id}
            className={`flex items-start gap-2 p-2 rounded-lg hover:bg-slate-800/40 transition-colors ${getStatusColor(item.stake_status, item.credibility_score)}`}
            style={{ animationDelay: `${i * 0.05}s` }}
          >
            {getStatusIcon(item.stake_status, item.credibility_score)}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-slate-500 shrink-0">{timeAgo(item.submitted_at)}</span>
                <span className="text-slate-600">|</span>
                <span className="text-cyan-400/70 shrink-0">{item.domain}</span>
              </div>
              <p className="text-slate-300 truncate mt-0.5">&quot;{item.text_claim}&quot;</p>
              <div className="flex gap-3 mt-1 text-[10px] text-slate-500">
                <span>Score: {(item.credibility_score * 100).toFixed(0)}%</span>
                <span>Stake: ${item.stake_amount}</span>
                <span>Buys: {item.consumed_count}</span>
                <span className="uppercase">{item.stake_status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}