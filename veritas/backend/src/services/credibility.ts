// ─────────────────────────────────────────────
// APERTURE BAYESIAN CREDIBILITY ENGINE (V3)
// Hardened: 9-flaw fix pass
// ─────────────────────────────────────────────

export interface FactData {
  id: string;
  embedding: number[];
  reputation: number;
  stake: number;
  latitude: number;
  longitude: number;
  timestamp: number; // Unix epoch ms
  domain?: string;
}

// ─────────────────────────────────────────────
// FEATURE FLAGS
// Toggle: Set to true to enable domain-specific weight distributions and geospatial geometries.
// When false, the engine uses the original balanced physics (validated by thesis verification suite).
// ─────────────────────────────────────────────
export const DOMAIN_ADAPTIVE_WEIGHTS = false; // ← TOGGLE: flip to false to use fixed balanced math


// 1. Vector Math Helpers
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b) {
    console.error("🚨 Vector missing in cosineSimilarity! vecA is:", typeof a, "| vecB is:", typeof b);
    return 0; // Return 0 similarity, or throw a more descriptive error
  }

  // 2. Check if either vector is empty
  if (a.length === 0 || b.length === 0) {
    return 0; 
  }
  // FIX: Guard against mismatched vector lengths (e.g., corrupted/truncated DB embeddings)
  const len = Math.min(a.length, b.length);
  if (a.length !== b.length) {
    console.warn(`⚠️ Vector length mismatch: ${a.length} vs ${b.length}. Using first ${len} dims.`);
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// 2. Reputation-Weighted Agreement (S_rep)
export function computeSRep(target: FactData, related: FactData[]): number {
  if (related.length === 0) return target.reputation * 0.6; // Weak prior from own rep, no self-vote inflation
  
  // FIX: Removed self-voting bias. Only community votes count.
  let weightedSum = 0;
  let totalWeight = 0;

  related.forEach(fact => {
    const sim = cosineSimilarity(target.embedding, fact.embedding);
    const vote = sim > 0.65 ? 1 : (sim < 0.4 ? -1 : 0);
    weightedSum += fact.reputation * vote;
    totalWeight += fact.reputation;
  });

  // If nobody with meaningful reputation has weighed in, use submitter's own rep as weak prior
  if (totalWeight === 0) return target.reputation * 0.6;

  const rawScore = weightedSum / totalWeight; // Range: [-1, 1]
  return (rawScore + 1) / 2; // Normalize to [0, 1]
}

// 3. Stake Diversity Score (S_stake) - UPGRADED TO QUADRATIC STAKING
export function computeSStake(target: FactData, related: FactData[]): number {
  // FIX: Clamp negative/NaN stakes to 0 to prevent Math.sqrt(negative) → NaN
  const allStakes = [target.stake, ...related.map(r => r.stake)].map(s => Math.max(0, s || 0));
  
  // Quadratic Math: Sum the square roots of the stakes to prevent Whale dominance
  const totalSqrtStake = allStakes.reduce((sum, stake) => sum + Math.sqrt(stake), 0);
  
  if (totalSqrtStake === 0) return 0.3; 

  const maxSingleSqrtStake = Math.max(...allStakes.map(s => Math.sqrt(s)));
  const concentrationRatio = maxSingleSqrtStake / totalSqrtStake;
  
  // Penalize if one entity holds > 70% of the quadratic voting power
  // Only applies when there are 2+ stakers (solo staker is always 100% by definition)
  const penalty = (allStakes.length >= 2 && concentrationRatio > 0.7) ? (concentrationRatio - 0.7) * 2 : 0;
  
  // Base score scales with total quadratic stake (Maxes out around $25 real USDC)
  const baseScore = Math.min(1, totalSqrtStake / 5.0); 
  return Math.max(0.1, baseScore - penalty);
}

// 4. Geospatial Corroboration (S_geo)
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; 
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeSGeo(target: FactData, related: FactData[]): number {
  if (related.length === 0) return 0.4; 

  let totalDist = 0;
  related.forEach(fact => {
    totalDist += haversine(target.latitude, target.longitude, fact.latitude, fact.longitude);
  });
  
  const avgDist = totalDist / related.length;

  // FIX: Bot farm floor — identical GPS to the meter
  if (avgDist < 0.01) return 0.1;
  
  // Default values (Balanced Fallback - Thesis Verified)
  let mu = 1.0; 
  let sigma = 3.0;
  let scatterPenaltyThreshold = 50;

  // Domain-Adaptive Geographic Physics
  if (DOMAIN_ADAPTIVE_WEIGHTS && target.domain) {
    switch (target.domain) {
      case 'logistics':
      case 'infrastructure':
      case 'maritime-logistics':
        // Highly localized specific events (a blocked port, a broken crane)
        mu = 0.5;
        sigma = 1.5;
        scatterPenaltyThreshold = 10;
        break;
      case 'energy':
      case 'agricultural':
        // Wide-area regional events (power grid failure, drought stress)
        mu = 5.0;
        sigma = 10.0;
        scatterPenaltyThreshold = 100;
        break;
      case 'financial':
        // Digital events - Physical GPS practically irrelevant, massive forgiving curve
        mu = 100.0;
        sigma = 500.0;
        scatterPenaltyThreshold = 5000;
        break;
    }
  }
  
  // Map average distance against the active Gaussian bell curve
  // Formula: e^(-(x - μ)² / 2σ²)
  const varianceStringent = 2 * Math.pow(sigma, 2);
  const gaussian = Math.exp(-Math.pow(avgDist - mu, 2) / varianceStringent);
  
  // Extreme scatter penalty (clearly unrelated events outside domain bounds)
  if (avgDist > scatterPenaltyThreshold) return 0.15;
  
  return Math.max(0.1, gaussian);
}

// 5. Temporal Entropy + Coefficient of Variation (S_temporal)
export function computeSTemporal(target: FactData, related: FactData[]): number {
  if (related.length === 0) return 0.5;

  const times = [target.timestamp, ...related.map(r => r.timestamp)].sort();
  const gapsMins = times.slice(1).map((t, i) => (t - times[i]) / 60000);

  const totalGaps = gapsMins.length;
  if (totalGaps === 0) return 0.5;

  // FIX: 8 buckets instead of 4 for finer entropy resolution
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0];
  gapsMins.forEach(gap => {
    if (gap < 0.1) buckets[0]++;       // <6 seconds (scripted)
    else if (gap < 1) buckets[1]++;    // <1 min
    else if (gap < 3) buckets[2]++;    // 1-3 min
    else if (gap < 10) buckets[3]++;   // 3-10 min
    else if (gap < 30) buckets[4]++;   // 10-30 min
    else if (gap < 60) buckets[5]++;   // 30min-1hr
    else if (gap < 240) buckets[6]++;  // 1-4 hours
    else buckets[7]++;                 // >4 hours
  });

  // Shannon entropy (measures randomness of time distribution)
  const probs = buckets.map(b => b / totalGaps).filter(p => p > 0);
  const entropy = -probs.reduce((sum, p) => sum + p * Math.log2(p), 0);
  const maxEntropy = Math.log2(8); // Updated for 8 buckets
  const entropyScore = entropy / maxEntropy;

  // FIX: Coefficient of Variation (harder to game than entropy alone)
  // A smart bot adding random 2-min jitter has low CoV; real humans have high CoV
  const meanGap = gapsMins.reduce((a, b) => a + b, 0) / totalGaps;
  const stdDev = Math.sqrt(gapsMins.reduce((sum, g) => sum + Math.pow(g - meanGap, 2), 0) / totalGaps);
  const cov = meanGap > 0 ? stdDev / meanGap : 0; // CoV: 0 = perfectly regular, >1 = highly varied
  const covScore = Math.min(1, cov / 1.5); // Normalize: CoV of 1.5+ → perfect score

  // Hard floor: if >50% of gaps are under 6 seconds → scripted bot
  if (buckets[0] / totalGaps > 0.5) return 0.1;

  // Hybrid: 60% entropy + 40% CoV (both must be high for full score)
  return (0.6 * entropyScore) + (0.4 * covScore);
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

  // FIX: Detect contradictions — very low similarity means semantic OPPOSITION
  // E.g., "Crane is working fine" vs "Crane is completely broken"
  // Threshold set to 0.05: MiniLM-L6 normalized embeddings rarely go below 0.05
  // unless texts are genuinely contradictory. 0.15 was too aggressive and flagged
  // unrelated-but-harmless sentences as contradictions.
  const contradictions = similarities.filter(s => s < 0.05);
  if (contradictions.length > 0) {
    // Contradictions are NOT diversity — they indicate disagreement.
    // Penalize heavily: more contradictions = lower score
    const contradictionRatio = contradictions.length / similarities.length;
    return Math.max(0.1, 0.3 * (1 - contradictionRatio));
  }

  const score = Math.min(1, variance / 0.05); 
  const meanPenalty = mean > 0.88 ? (mean - 0.88) * 5 : 0; // Penalize LLM clones
  
  return Math.max(0.1, score - meanPenalty);
}

// ─────────────────────────────────────────────
// DOMAIN-ADAPTIVE BAYESIAN PRIORS
// Toggle: Set to true to enable domain-specific weight distributions.
// When false, the engine uses the original balanced weights (validated by thesis verification suite).
// ─────────────────────────────────────────────
export const DOMAIN_ADAPTIVE_WEIGHTS = true; // ← TOGGLE: flip to false to use fixed balanced weights

function getDomainWeights(domain?: string, stage: 1 | 2 = 1) {
  // The balanced fallback weights (original V3 engine, thesis-verified)
  const BALANCED: { w_rep: number, w_stake: number, w_geo: number, w_temporal: number, w_semantic: number } = 
    { w_rep: 0.30, w_stake: 0.25, w_geo: 0.15, w_temporal: 0.15, w_semantic: 0.15 };

  let w = BALANCED;

  // Only apply domain-specific priors if the feature is enabled
  if (DOMAIN_ADAPTIVE_WEIGHTS && domain) {
    switch(domain) {
      case 'logistics':
      case 'maritime-logistics':
        // Physical events moving through space and time
        w = { w_rep: 0.20, w_stake: 0.15, w_geo: 0.30, w_temporal: 0.25, w_semantic: 0.10 };
        break;
      case 'financial':
        // Digital events where reputation and text exactness matter more than GPS
        w = { w_rep: 0.40, w_stake: 0.25, w_geo: 0.05, w_temporal: 0.05, w_semantic: 0.25 };
        break;
      case 'agricultural':
      case 'energy':
      case 'infrastructure':
        // Stationary physical infrastructure
        w = { w_rep: 0.25, w_stake: 0.25, w_geo: 0.25, w_temporal: 0.15, w_semantic: 0.10 };
        break;
      // default: already set to BALANCED above
    }
  }
  
  if (stage === 1) return w;
  
  // Stage 2: mathematically scale the structural priors down by 0.9
  // to reserve exactly 0.10 (10%) for the AI agent's truth verification voting block.
  return {
    w_rep: w.w_rep * 0.9,
    w_stake: w.w_stake * 0.9,
    w_geo: w.w_geo * 0.9,
    w_temporal: w.w_temporal * 0.9,
    w_semantic: w.w_semantic * 0.9,
    w_agent: 0.10
  };
}


// ─────────────────────────────────────────────
// STAGE 1: PROVISIONAL SCORING (TIME = 0)
// Runs immediately when a human submits a fact. No agent feedback exists yet.
// ─────────────────────────────────────────────
export function calculateProvisionalScore(target: FactData, related: FactData[]) {
  // FIX: Bootstrap mode no longer gives a free pass.
  // No corroboration = genuinely unknown. Score reflects that.
  if (related.length === 0) {
    // Compute what we CAN: stake signal from the submitter alone
    const s_stake_solo = computeSStake(target, []);
    const bootstrapScore = 0.35 + (s_stake_solo * 0.15); // Range: 0.38 - 0.50
    return {
      finalScore: bootstrapScore,
      status: 'PENDING_CORROBORATION', // Not approved, not rejected — waiting for more data
      signals: { s_rep: target.reputation * 0.6, s_stake: s_stake_solo, s_geo: 0.4, s_temporal: 0.5, s_semantic: 0.5 }
    };
  }
  const s_rep = computeSRep(target, related);
  const s_stake = computeSStake(target, related);
  const s_geo = computeSGeo(target, related);
  const s_temporal = computeSTemporal(target, related);
  const s_semantic = computeSSemantic(target, related);

  // Time=0 Priors: Domain-Adaptive weights are pulled dynamically
  const weights = getDomainWeights(target.domain, 1);

  const finalScore = 
    (weights.w_rep * s_rep) +
    (weights.w_stake * s_stake) +
    (weights.w_geo * s_geo) +
    (weights.w_temporal * s_temporal) +
    (weights.w_semantic * s_semantic);

  // 3-tier classification:
  // >= 0.70 → High confidence, approve for market
  // 0.40 - 0.70 → Uncertain, allow but flag for corroboration
  // < 0.40 → Strong Sybil/bot indicators, reject
  const status = finalScore >= 0.70 
    ? 'APPROVED_FOR_MARKET' 
    : finalScore >= 0.40 
      ? 'PENDING_CORROBORATION' 
      : 'REJECTED_SYBIL_SUSPECT';

  return {
    finalScore,
    status,
    signals: { s_rep, s_stake, s_geo, s_temporal, s_semantic }
  };
}

// ─────────────────────────────────────────────
// STAGE 2: TERMINAL SETTLEMENT (TIME = 1)
// Runs after the AI Agent buys the data and submits ground-truth feedback.
// ─────────────────────────────────────────────
export function calculateTerminalScore(
  provisionalSignals: { s_rep: number, s_stake: number, s_geo: number, s_temporal: number, s_semantic: number }, 
  agentFeedbackTrue: boolean, 
  agentTrustScore: number, // T_agent (0.0 to 1.0)
  domain?: string
) {
  const { s_rep, s_stake, s_geo, s_temporal, s_semantic } = provisionalSignals;
  
  // Agent signal is binary based on their ground-truth report
  const s_agent = agentFeedbackTrue ? 1.0 : 0.0;

  // Base Priors (Dynamically adapted by domain, scaled for Stage 2)
  const baseWeights = getDomainWeights(domain, 2) as any;

  // Adjust the agent's weight by their Trust Score (Liars are mathematically ignored)
  const effectiveAgentWeight = baseWeights.w_agent * agentTrustScore;
  
  // FIX: Proportional redistribution instead of equal.
  // When agent is untrusted, lean more on signals that already have higher weights
  // (rep and stake are more discriminative than temporal alone)
  const lostAgentWeight = baseWeights.w_agent - effectiveAgentWeight;
  const otherWeightsSum = baseWeights.w_rep + baseWeights.w_stake + baseWeights.w_geo + baseWeights.w_temporal + baseWeights.w_semantic;
  
  const w_rep_adj    = baseWeights.w_rep    + lostAgentWeight * (baseWeights.w_rep / otherWeightsSum);
  const w_stake_adj  = baseWeights.w_stake  + lostAgentWeight * (baseWeights.w_stake / otherWeightsSum);
  const w_geo_adj    = baseWeights.w_geo    + lostAgentWeight * (baseWeights.w_geo / otherWeightsSum);
  const w_temp_adj   = baseWeights.w_temporal + lostAgentWeight * (baseWeights.w_temporal / otherWeightsSum);
  const w_sem_adj    = baseWeights.w_semantic + lostAgentWeight * (baseWeights.w_semantic / otherWeightsSum);

  const finalScore = 
    (w_rep_adj * s_rep) +
    (w_stake_adj * s_stake) +
    (w_geo_adj * s_geo) +
    (w_temp_adj * s_temporal) +
    (w_sem_adj * s_semantic) +
    (effectiveAgentWeight * s_agent);

  return {
    finalScore,
    terminal_status: finalScore >= 0.70 ? 'REWARD' : 'SLASH',
    signals: { ...provisionalSignals, s_agent },
    effectiveAgentWeight
  };
}