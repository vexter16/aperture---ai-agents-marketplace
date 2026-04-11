"use client";
import { useState } from "react";
import { Send, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const DOMAINS = [
  { value: "financial", label: "Financial" },
  { value: "logistics", label: "Logistics" },
  { value: "agricultural", label: "Agricultural" },
  { value: "maritime-logistics", label: "Maritime" },
  { value: "energy", label: "Energy" },
  { value: "infrastructure", label: "Infrastructure" },
];

interface SubmitResult {
  type: "success" | "error";
  message: string;
  score?: number;
  status?: string;
}

export default function SubmitFact({ onSubmitted }: { onSubmitted?: () => void }) {
  const [claim, setClaim] = useState("");
  const [domain, setDomain] = useState("logistics");
  const [wallet, setWallet] = useState("");
  const [stake, setStake] = useState("1.0");
  const [lat, setLat] = useState("12.9716");
  const [lon, setLon] = useState("77.5946");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    const formData = new FormData();
    formData.append("text_claim", claim);
    formData.append("domain", domain);
    formData.append("wallet_address", wallet);
    formData.append("stake_amount", stake);
    formData.append("latitude", lat);
    formData.append("longitude", lon);

    try {
      const res = await fetch(`${API}/facts`, { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        setResult({
          type: "success",
          message: data.message || "Fact staked successfully",
          score: data.credibility_score,
          status: data.status,
        });
        setClaim("");
        onSubmitted?.();
      } else {
        setResult({ type: "error", message: data.error || "Submission failed" });
      }
    } catch {
      setResult({ type: "error", message: "Cannot reach backend — is the server running?" });
    } finally {
      setSubmitting(false);
    }
  };

  const fillDemoWallet = () => {
    setWallet("0x" + "a".repeat(40));
  };

  return (
    <div className="glass-card p-4 flex flex-col h-full overflow-y-auto">
      <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide mb-3 flex items-center gap-2">
        <Send className="w-4 h-4 text-cyan-400" />
        Submit Intelligence
      </h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-2.5 flex-1">
        <textarea
          value={claim}
          onChange={e => setClaim(e.target.value)}
          placeholder="Enter your ground-truth claim..."
          className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 resize-none"
          rows={2}
          required
        />

        <div className="grid grid-cols-2 gap-2">
          <select
            value={domain}
            onChange={e => setDomain(e.target.value)}
            className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
          >
            {DOMAINS.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>

          <input
            type="number"
            value={stake}
            onChange={e => setStake(e.target.value)}
            placeholder="Stake (USDC)"
            step="0.1"
            min="0.01"
            className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
            required
          />
        </div>

        <div className="relative">
          <input
            type="text"
            value={wallet}
            onChange={e => setWallet(e.target.value)}
            placeholder="0x... (Wallet Address)"
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500/50"
            required
          />
          <button type="button" onClick={fillDemoWallet}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] text-cyan-400 hover:text-cyan-300 bg-slate-700/60 px-1.5 py-0.5 rounded">
            Demo
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input type="text" value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude"
            className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50" required />
          <input type="text" value={lon} onChange={e => setLon(e.target.value)} placeholder="Longitude"
            className="bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50" required />
        </div>

        <button type="submit" disabled={submitting}
          className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:cursor-not-allowed text-white text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {submitting ? "Staking..." : "Stake & Submit"}
        </button>
      </form>

      {result && (
        <div className={`mt-2 p-2.5 rounded-lg text-xs flex items-start gap-2 ${
          result.type === "success" 
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
            : "bg-red-500/10 text-red-400 border border-red-500/20"
        }`}>
          {result.type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <div>
            <p>{result.message}</p>
            {result.score !== undefined && (
              <p className="mt-1 text-[10px] opacity-75">
                Credibility: {(result.score * 100).toFixed(1)}% • Status: {result.status}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
