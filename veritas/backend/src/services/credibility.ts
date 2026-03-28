// ─────────────────────────────────────────────
// VERITAS BAYESIAN CREDIBILITY ENGINE
// ─────────────────────────────────────────────

export interface FactData {
  id: string;
  embedding: number[];
  reputation: number;
  stake: number;
  latitude: number;
  longitude: number;
  timestamp: number; // Unix epoch ms
}

// 1. Vector Math Helpers
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 2. Reputation-Weighted Agreement (S_rep)
// Math: S_rep = sum(R_i * V_i) / sum(R_i)
export function computeSRep(target: FactData, related: FactData[]): number {
  if (related.length === 0) return 0.5; // Neutral
  
  let weightedSum = target.reputation; // Target fact votes for itself (+1)
  let totalWeight = target.reputation;

  related.forEach(fact => {
    const sim = cosineSimilarity(target.embedding, fact.embedding);
    // If similarity > 0.65, it's an agreement (+1). If < 0.4, it's a contradiction (-1).
    const vote = sim > 0.65 ? 1 : (sim < 0.4 ? -1 : 0);
    weightedSum += fact.reputation * vote;
    totalWeight += fact.reputation;
  });

  const rawScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return (rawScore + 1) / 2; // Normalize [-1, 1] to [0, 1]
}

// 3. Stake Diversity Score (S_stake)
export function computeSStake(target: FactData, related: FactData[]): number {
  const allStakes = [target.stake, ...related.map(r => r.stake)];
  const totalStake = allStakes.reduce((a, b) => a + b, 0);
  
  if (totalStake === 0) return 0.3; // Low score for zero skin-in-the-game

  const maxSingleStake = Math.max(...allStakes);
  const concentrationRatio = maxSingleStake / totalStake;
  
  // Penalize if one entity holds > 70% of the total stake (Whale/Sybil attack)
  const penalty = concentrationRatio > 0.7 ? (concentrationRatio - 0.7) * 2 : 0;
  
  // Base score scales with total stake, minus concentration penalty
  const baseScore = Math.min(1, totalStake / 5.0); // Maxes out at $5.00 total pool
  return Math.max(0.1, baseScore - penalty);
}

// 4. Geospatial Corroboration (S_geo)
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeSGeo(target: FactData, related: FactData[]): number {
  if (related.length === 0) return 0.4; // Slightly below neutral if isolated

  let totalDist = 0;
  related.forEach(fact => {
    totalDist += haversine(target.latitude, target.longitude, fact.latitude, fact.longitude);
  });
  
  const avgDist = totalDist / related.length;

  // Ideal organic spread: 0.1km to 5km. 
  // < 0.05km is highly suspicious (bot farm using exact same GPS).
  if (avgDist < 0.05) return 0.1; 
  if (avgDist > 20) return 0.2; // Too far to be observing the same event
  
  return Math.min(1, avgDist / 2); // Peaks around 2km separation
}

// 5. Temporal Entropy (S_temporal)
// Math: Shannon Entropy H = -sum(p(x) * log2(p(x)))
export function computeSTemporal(target: FactData, related: FactData[]): number {
  if (related.length === 0) return 0.5;

  const times = [target.timestamp, ...related.map(r => r.timestamp)].sort();
  const gapsMins = times.slice(1).map((t, i) => (t - times[i]) / 60000);

  // Buckets: <1m, 1-5m, 5-30m, 30m+
  const buckets = [0, 0, 0, 0];
  gapsMins.forEach(gap => {
    if (gap < 1) buckets[0]++;
    else if (gap < 5) buckets[1]++;
    else if (gap < 30) buckets[2]++;
    else buckets[3]++;
  });

  const totalGaps = gapsMins.length;
  if (totalGaps === 0) return 0.5;

  const probs = buckets.map(b => b / totalGaps).filter(p => p > 0);
  const entropy = -probs.reduce((sum, p) => sum + p * Math.log2(p), 0);
  const maxEntropy = Math.log2(4); 

  // If >50% of submissions happen within 1 minute, it's a coordinated bot swarm
  if (buckets[0] / totalGaps > 0.5) return 0.1;

  return entropy / maxEntropy;
}

// 6. Semantic Variance (S_semantic)
export function computeSSemantic(target: FactData, related: FactData[]): number {
  if (related.length === 0) return 0.5;

  const allEmbeddings = [target.embedding, ...related.map(r => r.embedding)];
  const similarities: number[] = [];
  
  for (let i = 0; i < allEmbeddings.length; i++) {
    for (let j = i + 1; j < allEmbeddings.length; j++) {
      similarities.push(cosineSimilarity(allEmbeddings[i], allEmbeddings[j]));
    }
  }

  const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length;
  const variance = similarities.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / similarities.length;

  // LLM bot swarms have near-zero variance (they generate highly similar vector clusters).
  // Real humans have natural linguistic variance.
  const score = Math.min(1, variance / 0.05); // Normalize variance
  const meanPenalty = mean > 0.88 ? (mean - 0.88) * 5 : 0; // Penalize if text is literally identical
  
  return Math.max(0.1, score - meanPenalty);
}

// ─────────────────────────────────────────────
// FINAL AGGREGATION
// Math: C = sum(w_i * S_i)
// ─────────────────────────────────────────────
export function evaluateFactCredibility(target: FactData, related: FactData[]) {
  const s_rep = computeSRep(target, related);
  const s_stake = computeSStake(target, related);
  const s_geo = computeSGeo(target, related);
  const s_temporal = computeSTemporal(target, related);
  const s_semantic = computeSSemantic(target, related);
  const s_agent = 0.5; // Default neutral until agents consume and feedback

  // Uniform priors (would be updated via Bayesian learning in production)
  const weights = { w_rep: 0.25, w_stake: 0.20, w_geo: 0.15, w_temporal: 0.15, w_semantic: 0.15, w_agent: 0.10 };

  const finalScore = 
    (weights.w_rep * s_rep) +
    (weights.w_stake * s_stake) +
    (weights.w_geo * s_geo) +
    (weights.w_temporal * s_temporal) +
    (weights.w_semantic * s_semantic) +
    (weights.w_agent * s_agent);

  return {
    finalScore,
    signals: { s_rep, s_stake, s_geo, s_temporal, s_semantic, s_agent }
  };
}