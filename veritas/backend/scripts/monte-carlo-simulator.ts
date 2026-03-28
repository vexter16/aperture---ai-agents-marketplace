// ─────────────────────────────────────────────────────────────────
// VERITAS PROTOCOL: MONTE CARLO THESIS SIMULATOR
// Simulates Organic Human Behavior vs. Coordinated Sybil Attacks
// ─────────────────────────────────────────────────────────────────

interface UserWallet {
  id: string;
  reputation: number; // S_rep (0 to 1)
  balanceUSDC: number;
}

interface FactSubmission {
  userId: string;
  embedding: number[];
  stake: number;
  latitude: number;
  longitude: number;
  timestamp: number;
}

// --- 1. Math & Distance Helpers ---
const cosineSimilarity = (a: number[], b: number[]) => {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; normA += a[i]*a[i]; normB += b[i]*b[i]; }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
};

const haversineDist = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Generates a mock 384-dimensional vector. High variance = human, Low variance = LLM Bot
const generateVector = (base: number, variance: number) => 
  Array.from({ length: 384 }, () => base + (Math.random() * variance - variance/2));


// --- 2. The 5-Axis Provisional Credibility Engine (Time = 0) ---
function calculateProvisionalCredibility(target: FactSubmission, pool: FactSubmission[], submitterRep: number) {
  if (pool.length < 3) return { score: 0.5, status: "INSUFFICIENT_DATA_BOOTSTRAP_MODE" };

  // S_rep (User's current standing)
  const s_rep = submitterRep;

  // S_stake (Is it a whale trying to force a lie?)
  const totalStake = pool.reduce((sum, f) => sum + f.stake, 0);
  const maxStake = Math.max(...pool.map(f => f.stake));
  const s_stake = Math.max(0.1, Math.min(1, totalStake / 5.0) - (maxStake/totalStake > 0.7 ? 0.4 : 0));

  // S_geo (Are they too close together?)
  const avgDist = pool.reduce((sum, f) => sum + haversineDist(target.latitude, target.longitude, f.latitude, f.longitude), 0) / pool.length;
  const s_geo = avgDist < 0.01 ? 0.1 : Math.min(1, avgDist / 0.3); // Penalize < 10 meters

  // S_temporal (Did they all submit at the exact same millisecond?)
  const times = pool.map(f => f.timestamp).sort();
  const gapsMins = times.slice(1).map((t, i) => (t - times[i]) / 60000);
  const s_temporal = gapsMins.every(g => g < 0.1) ? 0.1 : 0.85; // Simple entropy heuristic for simulator

  // S_semantic (Did an LLM generate all these texts?)
  let totalSim = 0, pairs = 0;
  for (let i=0; i<pool.length; i++) {
    for (let j=i+1; j<pool.length; j++) {
      totalSim += cosineSimilarity(pool[i].embedding, pool[j].embedding);
      pairs++;
    }
  }
  const avgSim = totalSim / pairs;
  const s_semantic = avgSim > 0.98 ? 0.1 : 0.9; // > 98% identical vectors = Bot Swarm

  // Weighted Sum (w_agent is 0 here because it's Time=0)
  const score = (0.30 * s_rep) + (0.20 * s_stake) + (0.20 * s_geo) + (0.15 * s_temporal) + (0.15 * s_semantic);
  return { score, signals: { s_rep, s_stake, s_geo, s_temporal, s_semantic } };
}


// --- 3. Run The Simulation ---
function runMonteCarlo() {
  console.log("\n==========================================================");
  console.log(" 🔬 VERITAS: MONTE CARLO THESIS SIMULATOR");
  console.log("==========================================================\n");

  // Define our Users
  const honestUser: UserWallet = { id: "Wallet_0xHuman", reputation: 0.8, balanceUSDC: 50.0 };
  const maliciousAttacker: UserWallet = { id: "Wallet_0xHacker", reputation: 0.5, balanceUSDC: 50.0 };

  console.log("📍 SCENARIO A: ORGANIC HUMAN EVENT (Bengaluru Traffic Accident)");
  // 5 humans report an accident. Times are staggered over 15 mins. GPS varies by ~100m. Text varies naturally.
  const baseTime = Date.now();
  const humanPool: FactSubmission[] = [
    { userId: honestUser.id, embedding: generateVector(0.5, 0.4), stake: 1.0, latitude: 12.9716, longitude: 77.5946, timestamp: baseTime },
    { userId: "Human2", embedding: generateVector(0.5, 0.5), stake: 1.5, latitude: 12.9720, longitude: 77.5950, timestamp: baseTime + 4*60000 },
    { userId: "Human3", embedding: generateVector(0.5, 0.3), stake: 0.5, latitude: 12.9710, longitude: 77.5940, timestamp: baseTime + 11*60000 },
    { userId: "Human4", embedding: generateVector(0.5, 0.6), stake: 2.0, latitude: 12.9730, longitude: 77.5960, timestamp: baseTime + 14*60000 }
  ];

  const provA = calculateProvisionalCredibility(humanPool[0], humanPool, honestUser.reputation);
  console.log(`[Time = 0] Provisional Score: ${(provA.score * 100).toFixed(1)}%`);
  console.log("Network Decision:", provA.score > 0.75 ? "✅ APPROVED (Published to Market)" : "❌ REJECTED");

  console.log("\n⏳ Fast Forward 2 Days... Agent buys data and verifies truth.");
  console.log(`[Time = +2] S_agent Feedback Received: TRUE (+1.0)`);
  
  // Update Wallet
  honestUser.reputation = Math.min(1.0, honestUser.reputation + 0.1); // Rep goes up
  honestUser.balanceUSDC += 1.0; // Stake returned
  honestUser.balanceUSDC += 0.5; // Reward paid
  console.log(`💰 Honest User Settled. New Rep: ${honestUser.reputation.toFixed(2)}, New Balance: $${honestUser.balanceUSDC.toFixed(2)} USDC`);


  console.log("\n----------------------------------------------------------\n");

  console.log("📍 SCENARIO B: SYBIL BOT SWARM (Fake Fire in Koramangala)");
  // Attacker spins up 4 bot wallets to corroborate a lie.
  // GPS is perfectly identical. Timestamps are 1ms apart. Embeddings are LLM-cloned (no variance).
  const botPool: FactSubmission[] = [
    { userId: maliciousAttacker.id, embedding: generateVector(0.9, 0.001), stake: 4.0, latitude: 12.9351, longitude: 77.6241, timestamp: baseTime },
    { userId: "Bot1", embedding: generateVector(0.9, 0.001), stake: 0.1, latitude: 12.9351, longitude: 77.6241, timestamp: baseTime + 10 },
    { userId: "Bot2", embedding: generateVector(0.9, 0.001), stake: 0.1, latitude: 12.9351, longitude: 77.6241, timestamp: baseTime + 20 },
    { userId: "Bot3", embedding: generateVector(0.9, 0.001), stake: 0.1, latitude: 12.9351, longitude: 77.6241, timestamp: baseTime + 30 }
  ];

  const provB = calculateProvisionalCredibility(botPool[0], botPool, maliciousAttacker.reputation);
  console.log(`[Time = 0] Provisional Score: ${(provB.score * 100).toFixed(1)}%`);
  console.log("Engine Signals:", {
    "S_geo (Caught identical GPS)": provB.signals?.s_geo,
    "S_semantic (Caught LLM Text)": provB.signals?.s_semantic,
    "S_temporal (Caught script timing)": provB.signals?.s_temporal
  });
  console.log("Network Decision:", provB.score > 0.75 ? "✅ APPROVED" : "🛑 CRITICAL REJECTION: Sybil Attack Detected");

  console.log("\n⏳ Asynchronous Settlement triggers...");
  console.log(`[Time = 0.1] S_agent Feedback: OVERRIDDEN (Fact never made it to market)`);
  
  // Slash Wallet
  maliciousAttacker.reputation = Math.max(0, maliciousAttacker.reputation - 0.4); // Rep destroyed
  maliciousAttacker.balanceUSDC -= 4.0; // Stake BURNED
  console.log(`🔥 Attacker Slashed. New Rep: ${maliciousAttacker.reputation.toFixed(2)}, New Balance: $${maliciousAttacker.balanceUSDC.toFixed(2)} USDC (LOST $4.00)`);
  console.log("\n==========================================================\n");
}

runMonteCarlo();