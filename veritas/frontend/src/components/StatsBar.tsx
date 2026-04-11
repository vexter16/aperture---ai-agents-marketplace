"use client";
import { useEffect, useState } from "react";
import { Database, Users, TrendingUp, Shield } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function StatsBar() {
  const [stats, setStats] = useState({ totalFacts: 0, online: false });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [factsRes, healthRes] = await Promise.all([
          fetch(`${API}/facts`),
          fetch(`${API}/health`),
        ]);
        const factsData = await factsRes.json();
        const healthData = await healthRes.json();
        setStats({
          totalFacts: factsData.facts?.length || 0,
          online: healthData.status === "ok",
        });
      } catch {
        setStats(prev => ({ ...prev, online: false }));
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex gap-4 text-xs">
      <div className="flex items-center gap-1.5 text-slate-400">
        <Database className="w-3.5 h-3.5 text-cyan-400" />
        <span className="font-mono text-slate-300">{stats.totalFacts}</span>
        <span>facts indexed</span>
      </div>
      <div className="flex items-center gap-1.5 text-slate-400">
        <Shield className="w-3.5 h-3.5 text-cyan-400" />
        <span>6-Signal Bayesian</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${stats.online ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
        <span className={`font-mono ${stats.online ? 'text-emerald-400' : 'text-red-400'}`}>
          {stats.online ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
    </div>
  );
}
