import { evaluateFactCredibility, FactData } from '../src/services/credibility';

// Mock 384-dimensional vectors
const createVector = (base: number, variance: number) => 
  Array.from({ length: 384 }, () => base + (Math.random() * variance - variance/2));

function runSimulation() {
  console.log("🛡️ VERITAS CREDIBILITY ENGINE STRESS TEST\n");

  // ────────────────────────────────────────────────────────
  // SCENARIO A: ORGANIC HUMAN CORROBORATION
  // Humans observing the same event. Timestamps are spread out. 
  // GPS is slightly varied. Text meaning is similar but phrased differently.
  // ────────────────────────────────────────────────────────
  console.log("--- SCENARIO A: Organic Human Observers ---");
  const targetOrganic: FactData = {
    id: "org-1", embedding: createVector(0.5, 0.2), reputation: 0.8, stake: 0.5,
    latitude: 12.9351, longitude: 77.6241, timestamp: Date.now()
  };
  
  const relatedOrganic: FactData[] = [
    { id: "org-2", embedding: createVector(0.5, 0.3), reputation: 0.6, stake: 0.2, latitude: 12.9360, longitude: 77.6250, timestamp: Date.now() + 5 * 60000 }, // 5 mins later
    { id: "org-3", embedding: createVector(0.5, 0.4), reputation: 0.9, stake: 1.0, latitude: 12.9340, longitude: 77.6230, timestamp: Date.now() + 22 * 60000 } // 22 mins later
  ];

  const resultA = evaluateFactCredibility(targetOrganic, relatedOrganic);
  console.log(`Final Credibility Score: ${(resultA.finalScore * 100).toFixed(1)}%`);
  console.log(resultA.signals);
  console.log(resultA.finalScore > 0.70 ? "✅ PASSED: High credibility achieved." : "❌ FAILED");

  // ────────────────────────────────────────────────────────
  // SCENARIO B: LLM BOT SWARM (SYBIL ATTACK)
  // An attacker creates 5 fake accounts to corroborate their own lie.
  // Timestamps are identical. GPS is spoofed to the exact same millimeter.
  // Embeddings are highly clustered because an LLM generated them.
  // ────────────────────────────────────────────────────────
  console.log("\n--- SCENARIO B: Coordinated Bot Swarm ---");
  const targetBot: FactData = {
    id: "bot-1", embedding: createVector(0.9, 0.01), reputation: 0.3, stake: 2.0, // Whale stake
    latitude: 18.9442, longitude: 72.9490, timestamp: Date.now()
  };

  const relatedBots: FactData[] = Array.from({ length: 4 }).map((_, i) => ({
    id: `bot-${i+2}`,
    embedding: createVector(0.9, 0.01), // Near identical semantics
    reputation: 0.3, // New fake accounts
    stake: 0.1,
    latitude: 18.9442, // Exact same GPS 
    longitude: 72.9490,
    timestamp: Date.now() + 1000 // Submitted within 1 second of each other
  }));

  const resultB = evaluateFactCredibility(targetBot, relatedBots);
  console.log(`Final Credibility Score: ${(resultB.finalScore * 100).toFixed(1)}%`);
  console.log(resultB.signals);
  console.log(resultB.finalScore < 0.40 ? "✅ PASSED: Attack successfully neutralized and slashed." : "❌ FAILED: Engine tricked by bots.");
}

runSimulation();