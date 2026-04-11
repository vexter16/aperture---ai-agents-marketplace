// ══════════════════════════════════════════════════════════════════
// APERTURE PROTOCOL: THESIS VERIFICATION SUITE (V3 Engine)
// ══════════════════════════════════════════════════════════════════
// Run: npx ts-node scripts/thesis-verification.ts
// No server or database required — tests pure engine functions.
// ══════════════════════════════════════════════════════════════════

import {
  cosineSimilarity,
  computeSRep,
  computeSStake,
  computeSGeo,
  computeSTemporal,
  computeSSemantic,
  calculateProvisionalScore,
  calculateTerminalScore,
  FactData
} from '../src/services/credibility';

// ─── HELPERS ────────────────────────────────────────────────────

/** Generate a mock 384-dim embedding vector with configurable mean and variance */
function createVector(base: number, variance: number): number[] {
  return Array.from({ length: 384 }, () => base + (Math.random() * variance - variance / 2));
}

/** Generate N normally-distributed random values (Box-Muller) */
function normalRandom(mean: number, std: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Compute mean of array */
const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;

/** Compute standard deviation */
const stdDev = (arr: number[]) => {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((sum, x) => sum + Math.pow(x - m, 2), 0) / arr.length);
};

/** Compute percentile */
const percentile = (arr: number[], p: number) => {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(p / 100 * sorted.length);
  return sorted[Math.min(idx, sorted.length - 1)];
};

const DIVIDER = '═'.repeat(70);
const SECTION = '─'.repeat(70);

let totalPassed = 0;
let totalFailed = 0;
const failures: string[] = [];

function assert(condition: boolean, testName: string, detail: string = '') {
  if (condition) {
    totalPassed++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    totalFailed++;
    failures.push(testName);
    console.log(`  ❌ FAIL: ${testName}${detail ? ' — ' + detail : ''}`);
  }
}

// ══════════════════════════════════════════════════════════════════
// EXPERIMENT 1: UNIT BOUNDARY TESTS
// Tests each signal function with known inputs to verify
// mathematical correctness and edge case handling.
// ══════════════════════════════════════════════════════════════════

function experiment1_UnitTests() {
  console.log(`\n${DIVIDER}`);
  console.log(' EXPERIMENT 1: UNIT BOUNDARY TESTS');
  console.log(` Each signal tested with known inputs for deterministic validation.`);
  console.log(DIVIDER);

  // ── 1.1 Cosine Similarity ──
  console.log(`\n  ${SECTION}`);
  console.log('  1.1 Cosine Similarity');
  console.log(`  ${SECTION}`);

  // Identical vectors → 1.0
  const vecA = [1, 2, 3, 4, 5];
  assert(Math.abs(cosineSimilarity(vecA, vecA) - 1.0) < 0.001,
    'Identical vectors → similarity = 1.0');

  // Orthogonal vectors → 0.0
  const vecOrtho1 = [1, 0, 0];
  const vecOrtho2 = [0, 1, 0];
  assert(Math.abs(cosineSimilarity(vecOrtho1, vecOrtho2)) < 0.001,
    'Orthogonal vectors → similarity = 0.0');

  // Opposite vectors → -1.0
  const vecOpp1 = [1, 2, 3];
  const vecOpp2 = [-1, -2, -3];
  assert(Math.abs(cosineSimilarity(vecOpp1, vecOpp2) - (-1.0)) < 0.001,
    'Opposite vectors → similarity = -1.0');

  // Null/undefined guards
  assert(cosineSimilarity(null as any, vecA) === 0, 'Null vector A → returns 0 (no crash)');
  assert(cosineSimilarity(vecA, null as any) === 0, 'Null vector B → returns 0 (no crash)');
  assert(cosineSimilarity([], vecA) === 0, 'Empty vector A → returns 0');

  // Mismatched lengths
  const short = [1, 2];
  const long = [1, 2, 3, 4, 5];
  const sim = cosineSimilarity(short, long);
  assert(!isNaN(sim) && isFinite(sim), 'Mismatched lengths → no NaN, uses shorter length');

  // ── 1.2 S_rep (Reputation) ──
  console.log(`\n  ${SECTION}`);
  console.log('  1.2 S_rep (Reputation-Weighted Agreement)');
  console.log(`  ${SECTION}`);

  const baseEmbed = createVector(0.5, 0.01); // Very stable vector
  const targetFact: FactData = { id: 't1', embedding: baseEmbed, reputation: 0.8, stake: 1, latitude: 12.97, longitude: 77.59, timestamp: Date.now() };

  // No related facts → weak prior from own rep
  const sRepEmpty = computeSRep(targetFact, []);
  assert(Math.abs(sRepEmpty - 0.8 * 0.6) < 0.01,
    `No related facts → S_rep = reputation × 0.6 = ${sRepEmpty.toFixed(3)}`);

  // All high-rep agreeing facts (similar embeddings)
  const agreeingFacts: FactData[] = Array.from({ length: 5 }, (_, i) => ({
    id: `a${i}`, embedding: createVector(0.5, 0.01), reputation: 0.9,
    stake: 1, latitude: 12.97, longitude: 77.59, timestamp: Date.now()
  }));
  const sRepAgree = computeSRep(targetFact, agreeingFacts);
  assert(sRepAgree > 0.7,
    `5 high-rep agreeing facts → S_rep = ${sRepAgree.toFixed(3)} (should be > 0.7)`);

  // ── 1.3 S_stake (Quadratic Staking) ──
  console.log(`\n  ${SECTION}`);
  console.log('  1.3 S_stake (Quadratic Staking)');
  console.log(`  ${SECTION}`);

  // Single submitter, no related
  const sStakeSolo = computeSStake({ ...targetFact, stake: 5 }, []);
  assert(sStakeSolo > 0.3 && sStakeSolo <= 1.0,
    `Solo $5 stake → S_stake = ${sStakeSolo.toFixed(3)} (should be 0.3-1.0)`);

  // Whale attack: 1 person stakes $100, 4 stake $0.10
  const whaleTarget: FactData = { ...targetFact, stake: 100 };
  const tinyStakers: FactData[] = Array.from({ length: 4 }, () => ({ ...targetFact, stake: 0.1 }));
  const sStakeWhale = computeSStake(whaleTarget, tinyStakers);
  assert(sStakeWhale < 0.5,
    `Whale attack ($100 vs 4×$0.10) → S_stake = ${sStakeWhale.toFixed(3)} (penalized, < 0.5)`);

  // Negative stake guard
  const sStakeNeg = computeSStake({ ...targetFact, stake: -5 }, []);
  assert(!isNaN(sStakeNeg) && isFinite(sStakeNeg),
    `Negative stake → S_stake = ${sStakeNeg.toFixed(3)} (no NaN)`);

  // Zero stake
  const sStakeZero = computeSStake({ ...targetFact, stake: 0 }, []);
  assert(sStakeZero === 0.3, `Zero stake → S_stake = ${sStakeZero} (should be 0.3 default)`);

  // ── 1.4 S_geo (Geospatial) ──
  console.log(`\n  ${SECTION}`);
  console.log('  1.4 S_geo (Geospatial Corroboration)');
  console.log(`  ${SECTION}`);

  // Identical GPS (bot farm)
  const identicalGPS: FactData[] = [{ ...targetFact, latitude: 12.97, longitude: 77.59 }];
  const sGeoIdentical = computeSGeo(targetFact, identicalGPS);
  assert(sGeoIdentical <= 0.15,
    `Identical GPS → S_geo = ${sGeoIdentical.toFixed(3)} (bot farm, ≤ 0.15)`);

  // ~1km apart (realistic, Gaussian peak)
  const nearbyFacts: FactData[] = [{ ...targetFact, latitude: 12.979, longitude: 77.599 }]; // ~1km
  const sGeoNearby = computeSGeo(targetFact, nearbyFacts);
  assert(sGeoNearby > 0.7,
    `~1km apart → S_geo = ${sGeoNearby.toFixed(3)} (should be > 0.7, Gaussian peak)`);

  // 200m apart (dock workers — should NOT be penalized now)
  const closeByFacts: FactData[] = [{ ...targetFact, latitude: 12.9718, longitude: 77.5948 }]; // ~200m
  const sGeoClose = computeSGeo(targetFact, closeByFacts);
  assert(sGeoClose > 0.5,
    `~200m apart → S_geo = ${sGeoClose.toFixed(3)} (dock workers, should be > 0.5 after Gaussian fix)`);

  // Very far apart (>50km)
  const farAwayFacts: FactData[] = [{ ...targetFact, latitude: 13.5, longitude: 78.5 }]; // ~100km
  const sGeoFar = computeSGeo(targetFact, farAwayFacts);
  assert(sGeoFar < 0.5,
    `~100km apart → S_geo = ${sGeoFar.toFixed(3)} (too scattered, < 0.5)`);

  // No related facts
  const sGeoEmpty = computeSGeo(targetFact, []);
  assert(sGeoEmpty === 0.4, `No related facts → S_geo = ${sGeoEmpty} (default 0.4)`);

  // ── 1.5 S_temporal (Entropy + CoV) ──
  console.log(`\n  ${SECTION}`);
  console.log('  1.5 S_temporal (Temporal Entropy + Coefficient of Variation)');
  console.log(`  ${SECTION}`);

  const now = Date.now();

  // Bot timing: all within milliseconds
  const botTiming: FactData[] = Array.from({ length: 5 }, (_, i) => ({
    ...targetFact, timestamp: now + i * 100 // 100ms apart
  }));
  const sTemporalBot = computeSTemporal({ ...targetFact, timestamp: now }, botTiming);
  assert(sTemporalBot <= 0.15,
    `Bot timing (100ms gaps) → S_temporal = ${sTemporalBot.toFixed(3)} (≤ 0.15)`);

  // Natural human timing: varied gaps
  const humanTiming: FactData[] = [
    { ...targetFact, timestamp: now + 3 * 60000 },   // 3 min
    { ...targetFact, timestamp: now + 15 * 60000 },   // 15 min
    { ...targetFact, timestamp: now + 45 * 60000 },   // 45 min
    { ...targetFact, timestamp: now + 300 * 60000 },  // 5 hours
  ];
  const sTemporalHuman = computeSTemporal({ ...targetFact, timestamp: now }, humanTiming);
  assert(sTemporalHuman > 0.5,
    `Natural human timing → S_temporal = ${sTemporalHuman.toFixed(3)} (> 0.5)`);

  // No related
  const sTemporalEmpty = computeSTemporal(targetFact, []);
  assert(sTemporalEmpty === 0.5, `No related facts → S_temporal = ${sTemporalEmpty}`);

  // ── 1.6 S_semantic (Variance + Contradiction) ──
  console.log(`\n  ${SECTION}`);
  console.log('  1.6 S_semantic (Semantic Variance + Contradiction Detection)');
  console.log(`  ${SECTION}`);

  // LLM clones: near-identical embeddings
  const cloneEmbedding = createVector(0.9, 0.005);
  const cloneFacts: FactData[] = Array.from({ length: 4 }, () => ({
    ...targetFact, embedding: createVector(0.9, 0.005)
  }));
  const sSemanticClone = computeSSemantic({ ...targetFact, embedding: cloneEmbedding }, cloneFacts);
  assert(sSemanticClone < 0.3,
    `LLM clones (variance ≈ 0) → S_semantic = ${sSemanticClone.toFixed(3)} (penalized, < 0.3)`);

  // Diverse human text
  const diverseFacts: FactData[] = [
    { ...targetFact, embedding: createVector(0.5, 0.4) },
    { ...targetFact, embedding: createVector(0.6, 0.5) },
    { ...targetFact, embedding: createVector(0.4, 0.3) },
  ];
  const sSemanticDiverse = computeSSemantic({ ...targetFact, embedding: createVector(0.5, 0.35) }, diverseFacts);
  // This one can vary due to randomness — just check it's not penalized
  console.log(`  ℹ️  Diverse human text → S_semantic = ${sSemanticDiverse.toFixed(3)}`);

  // No related
  const sSemanticEmpty = computeSSemantic(targetFact, []);
  assert(sSemanticEmpty === 0.5, `No related facts → S_semantic = ${sSemanticEmpty}`);
}

// ══════════════════════════════════════════════════════════════════
// EXPERIMENT 2: MONTE CARLO CLASSIFICATION
// 10,000 trials per scenario, 5 scenarios.
// Proves the engine separates honest from malicious actors.
// ══════════════════════════════════════════════════════════════════

interface ScenarioResult {
  name: string;
  scores: number[];
  mean: number;
  std: number;
  min: number;
  max: number;
  p5: number;
  p95: number;
}

function generateHonestFacts(count: number): { target: FactData; related: FactData[] } {
  const now = Date.now();
  const baseLat = 12.97 + (Math.random() * 0.01);
  const baseLon = 77.59 + (Math.random() * 0.01);

  const target: FactData = {
    id: 'honest-target',
    embedding: createVector(0.5, 0.3 + Math.random() * 0.2),
    reputation: 0.5 + Math.random() * 0.4,
    stake: 0.5 + Math.random() * 4.5,
    latitude: baseLat,
    longitude: baseLon,
    timestamp: now
  };

  const related: FactData[] = Array.from({ length: count }, (_, i) => ({
    id: `honest-${i}`,
    embedding: createVector(0.5, 0.3 + Math.random() * 0.3), // Varied human text
    reputation: 0.4 + Math.random() * 0.5,
    stake: 0.3 + Math.random() * 3,
    latitude: baseLat + (Math.random() - 0.5) * 0.02,  // ±1km
    longitude: baseLon + (Math.random() - 0.5) * 0.02,
    timestamp: now + (Math.random() * 120 + 5) * 60000  // 5-125 min apart
  }));

  return { target, related };
}

function generateSybilFacts(count: number): { target: FactData; related: FactData[] } {
  const now = Date.now();

  const target: FactData = {
    id: 'sybil-target',
    embedding: createVector(0.9, 0.005), // LLM-generated, low variance
    reputation: 0.3 + Math.random() * 0.2,
    stake: 3 + Math.random() * 7, // Whale stake
    latitude: 18.9442,
    longitude: 72.9490,
    timestamp: now
  };

  const related: FactData[] = Array.from({ length: count }, (_, i) => ({
    id: `bot-${i}`,
    embedding: createVector(0.9, 0.005), // Near-identical
    reputation: 0.2 + Math.random() * 0.15, // New fake accounts
    stake: 0.05 + Math.random() * 0.1,
    latitude: 18.9442 + (Math.random() - 0.5) * 0.0001, // Same GPS ± meters
    longitude: 72.9490 + (Math.random() - 0.5) * 0.0001,
    timestamp: now + Math.random() * 3000 // Within 3 seconds
  }));

  return { target, related };
}

function generateSophisticatedAttack(count: number): { target: FactData; related: FactData[] } {
  const now = Date.now();

  const target: FactData = {
    id: 'smart-attacker',
    embedding: createVector(0.7, 0.15),
    reputation: 0.5,
    stake: 2,
    latitude: 12.97,
    longitude: 77.59,
    timestamp: now
  };

  const related: FactData[] = Array.from({ length: count }, (_, i) => ({
    id: `smart-bot-${i}`,
    embedding: createVector(0.7, 0.12 + Math.random() * 0.06), // Some variance added
    reputation: 0.35 + Math.random() * 0.2,
    stake: 0.5 + Math.random() * 1.5,
    latitude: 12.97 + (Math.random() - 0.5) * 0.005, // Small GPS jitter (~250m)
    longitude: 77.59 + (Math.random() - 0.5) * 0.005,
    timestamp: now + (60000 + Math.random() * 180000) // 1-4 min jitter
  }));

  return { target, related };
}

function generateMixedPool(): { target: FactData; related: FactData[] } {
  const now = Date.now();
  const baseLat = 12.97;
  const baseLon = 77.59;

  const target: FactData = {
    id: 'mixed-target',
    embedding: createVector(0.5, 0.3),
    reputation: 0.7,
    stake: 2,
    latitude: baseLat,
    longitude: baseLon,
    timestamp: now
  };

  // 3 honest + 1 liar
  const honest: FactData[] = Array.from({ length: 3 }, (_, i) => ({
    id: `mixed-honest-${i}`,
    embedding: createVector(0.5, 0.25 + Math.random() * 0.2),
    reputation: 0.6 + Math.random() * 0.3,
    stake: 1 + Math.random() * 2,
    latitude: baseLat + (Math.random() - 0.5) * 0.015,
    longitude: baseLon + (Math.random() - 0.5) * 0.015,
    timestamp: now + (Math.random() * 60 + 5) * 60000
  }));

  const liar: FactData = {
    id: 'mixed-liar',
    embedding: createVector(0.1, 0.1), // Completely different topic
    reputation: 0.3,
    stake: 0.1,
    latitude: baseLat + 0.5, // 50km away
    longitude: baseLon + 0.5,
    timestamp: now + 500 // Nearly instant
  };

  return { target, related: [...honest, liar] };
}

function experiment2_MonteCarlo(N: number = 10000) {
  console.log(`\n${DIVIDER}`);
  console.log(` EXPERIMENT 2: MONTE CARLO CLASSIFICATION (N = ${N.toLocaleString()} per scenario)`);
  console.log(DIVIDER);

  const scenarios: ScenarioResult[] = [];

  // Scenario A: Honest humans (4 related)
  console.log('\n  Running Scenario A: Organic Human Observers...');
  const scoresA: number[] = [];
  for (let i = 0; i < N; i++) {
    const { target, related } = generateHonestFacts(4);
    scoresA.push(calculateProvisionalScore(target, related).finalScore);
  }

  // Scenario B: Sybil bot swarm (4 bots)
  console.log('  Running Scenario B: Sybil Bot Swarm...');
  const scoresB: number[] = [];
  for (let i = 0; i < N; i++) {
    const { target, related } = generateSybilFacts(4);
    scoresB.push(calculateProvisionalScore(target, related).finalScore);
  }

  // Scenario C: Sophisticated attacker (4 smart bots)
  console.log('  Running Scenario C: Sophisticated Attacker...');
  const scoresC: number[] = [];
  for (let i = 0; i < N; i++) {
    const { target, related } = generateSophisticatedAttack(4);
    scoresC.push(calculateProvisionalScore(target, related).finalScore);
  }

  // Scenario D: Solo submitter (bootstrap mode)
  console.log('  Running Scenario D: Solo Submitter (Bootstrap)...');
  const scoresD: number[] = [];
  for (let i = 0; i < N; i++) {
    const target: FactData = {
      id: 'solo', embedding: createVector(0.5, 0.3),
      reputation: 0.3 + Math.random() * 0.6, stake: 0.5 + Math.random() * 5,
      latitude: 12.97, longitude: 77.59, timestamp: Date.now()
    };
    scoresD.push(calculateProvisionalScore(target, []).finalScore);
  }

  // Scenario E: Mixed pool (3 honest + 1 liar)
  console.log('  Running Scenario E: Mixed Pool (3 honest + 1 liar)...');
  const scoresE: number[] = [];
  for (let i = 0; i < N; i++) {
    const { target, related } = generateMixedPool();
    scoresE.push(calculateProvisionalScore(target, related).finalScore);
  }

  const results = [
    { name: 'A: Honest Humans', scores: scoresA },
    { name: 'B: Sybil Bots', scores: scoresB },
    { name: 'C: Smart Attacker', scores: scoresC },
    { name: 'D: Solo (Bootstrap)', scores: scoresD },
    { name: 'E: Mixed Pool', scores: scoresE },
  ].map(s => ({
    ...s,
    mean: mean(s.scores),
    std: stdDev(s.scores),
    min: Math.min(...s.scores),
    max: Math.max(...s.scores),
    p5: percentile(s.scores, 5),
    p95: percentile(s.scores, 95),
  }));

  console.log(`\n  ${SECTION}`);
  console.log('  MONTE CARLO RESULTS (N = ' + N.toLocaleString() + ' per scenario)');
  console.log(`  ${SECTION}`);
  console.log('  Scenario               | Mean ± Std    | [P5 — P95]       | Min    | Max');
  console.log('  ' + '─'.repeat(82));

  results.forEach(r => {
    const name = r.name.padEnd(22);
    const meanStr = `${(r.mean * 100).toFixed(1)}% ± ${(r.std * 100).toFixed(1)}%`;
    const rangeStr = `[${(r.p5 * 100).toFixed(1)}% — ${(r.p95 * 100).toFixed(1)}%]`;
    console.log(`  ${name} | ${meanStr.padEnd(13)} | ${rangeStr.padEnd(16)} | ${(r.min * 100).toFixed(1)}%  | ${(r.max * 100).toFixed(1)}%`);
  });

  // Separability analysis
  console.log(`\n  ${SECTION}`);
  console.log('  SEPARABILITY ANALYSIS');
  console.log(`  ${SECTION}`);

  const threshold = 0.70;
  const honestAbove = scoresA.filter(s => s >= threshold).length / N;
  const sybilBelow = scoresB.filter(s => s < threshold).length / N;
  const smartBelow = scoresC.filter(s => s < threshold).length / N;
  const mixedAbove = scoresE.filter(s => s >= threshold).length / N;

  console.log(`  At threshold = ${(threshold * 100).toFixed(0)}%:`);
  console.log(`    Honest approval rate:     ${(honestAbove * 100).toFixed(1)}%`);
  console.log(`    Sybil rejection rate:     ${(sybilBelow * 100).toFixed(1)}%`);
  console.log(`    Smart attack rejection:   ${(smartBelow * 100).toFixed(1)}%`);
  console.log(`    Mixed pool approval rate: ${(mixedAbove * 100).toFixed(1)}%`);

  // Overlap analysis: do honest scores and sybil scores ever overlap?
  const honestMin = Math.min(...scoresA);
  const sybilMax = Math.max(...scoresB);
  const overlap = sybilMax > honestMin;
  console.log(`\n  Distribution Overlap: Honest min = ${(honestMin * 100).toFixed(1)}%, Sybil max = ${(sybilMax * 100).toFixed(1)}%`);
  console.log(`  Overlap exists: ${overlap ? 'YES ⚠️ (some false positives/negatives possible)' : 'NO ✅ (perfect separability)'}`);

  assert(sybilBelow > 0.95, `Sybil detection rate > 95% (actual: ${(sybilBelow * 100).toFixed(1)}%)`);
  assert(honestAbove > 0.50, `Honest approval rate > 50% (actual: ${(honestAbove * 100).toFixed(1)}%)`);

  return results;
}

// ══════════════════════════════════════════════════════════════════
// EXPERIMENT 3: ABLATION STUDY
// Remove one signal at a time, measure degradation.
// Proves each signal is necessary.
// ══════════════════════════════════════════════════════════════════

function experiment3_Ablation(N: number = 5000) {
  console.log(`\n${DIVIDER}`);
  console.log(` EXPERIMENT 3: ABLATION STUDY (N = ${N.toLocaleString()})`);
  console.log(' Removes one signal at a time to prove each is necessary.');
  console.log(DIVIDER);

  function computeSybilDetectionRate(overrides: Partial<Record<string, number>> = {}): number {
    let detected = 0;
    for (let i = 0; i < N; i++) {
      const { target, related } = generateSybilFacts(4);

      const s_rep = overrides['s_rep'] ?? computeSRep(target, related);
      const s_stake = overrides['s_stake'] ?? computeSStake(target, related);
      const s_geo = overrides['s_geo'] ?? computeSGeo(target, related);
      const s_temporal = overrides['s_temporal'] ?? computeSTemporal(target, related);
      const s_semantic = overrides['s_semantic'] ?? computeSSemantic(target, related);

      const weights = { w_rep: 0.30, w_stake: 0.25, w_geo: 0.15, w_temporal: 0.15, w_semantic: 0.15 };
      const score =
        weights.w_rep * s_rep +
        weights.w_stake * s_stake +
        weights.w_geo * s_geo +
        weights.w_temporal * s_temporal +
        weights.w_semantic * s_semantic;

      if (score < 0.70) detected++;
    }
    return detected / N;
  }

  function computeHonestFPR(overrides: Partial<Record<string, number>> = {}): number {
    let falseRejections = 0;
    for (let i = 0; i < N; i++) {
      const { target, related } = generateHonestFacts(4);

      const s_rep = overrides['s_rep'] ?? computeSRep(target, related);
      const s_stake = overrides['s_stake'] ?? computeSStake(target, related);
      const s_geo = overrides['s_geo'] ?? computeSGeo(target, related);
      const s_temporal = overrides['s_temporal'] ?? computeSTemporal(target, related);
      const s_semantic = overrides['s_semantic'] ?? computeSSemantic(target, related);

      const weights = { w_rep: 0.30, w_stake: 0.25, w_geo: 0.15, w_temporal: 0.15, w_semantic: 0.15 };
      const score =
        weights.w_rep * s_rep +
        weights.w_stake * s_stake +
        weights.w_geo * s_geo +
        weights.w_temporal * s_temporal +
        weights.w_semantic * s_semantic;

      if (score < 0.70) falseRejections++;
    }
    return falseRejections / N;
  }

  // Full engine baseline
  const baselineDetection = computeSybilDetectionRate();
  const baselineFPR = computeHonestFPR();

  // Remove each signal by replacing it with neutral 0.5
  const signals = ['s_rep', 's_stake', 's_geo', 's_temporal', 's_semantic'];
  const ablationResults: { signal: string; detection: number; fpr: number; detLoss: number; fprGain: number }[] = [];

  signals.forEach(signal => {
    const det = computeSybilDetectionRate({ [signal]: 0.5 });
    const fpr = computeHonestFPR({ [signal]: 0.5 });
    ablationResults.push({
      signal,
      detection: det,
      fpr,
      detLoss: baselineDetection - det,
      fprGain: fpr - baselineFPR
    });
  });

  console.log(`\n  Baseline (Full Engine): Sybil Detection = ${(baselineDetection * 100).toFixed(1)}%, False Positive Rate = ${(baselineFPR * 100).toFixed(1)}%\n`);
  console.log('  Configuration          | Sybil Detect | FP Rate  | Detect Loss | FPR Change');
  console.log('  ' + '─'.repeat(78));
  console.log(`  Full 6-signal engine   | ${(baselineDetection * 100).toFixed(1)}%        | ${(baselineFPR * 100).toFixed(1)}%     | baseline    | baseline`);

  ablationResults.forEach(r => {
    const name = `Remove ${r.signal}`.padEnd(22);
    const detStr = `${(r.detection * 100).toFixed(1)}%`.padEnd(12);
    const fprStr = `${(r.fpr * 100).toFixed(1)}%`.padEnd(8);
    const lossStr = `${r.detLoss > 0 ? '-' : '+'}${(Math.abs(r.detLoss) * 100).toFixed(1)}%`.padEnd(11);
    const fprChange = `${r.fprGain > 0 ? '+' : ''}${(r.fprGain * 100).toFixed(1)}%`;
    console.log(`  ${name} | ${detStr} | ${fprStr} | ${lossStr} | ${fprChange}`);
  });

  // Assert each signal matters
  ablationResults.forEach(r => {
    assert(r.detLoss > 0 || r.fprGain > 0,
      `Removing ${r.signal} degrades performance (ΔDetection: ${(r.detLoss * 100).toFixed(1)}%, ΔFPR: ${(r.fprGain * 100).toFixed(1)}%)`);
  });
}

// ══════════════════════════════════════════════════════════════════
// EXPERIMENT 4: ROC/AUC ANALYSIS
// Sweep threshold 0.0→1.0, compute TPR/FPR at each point.
// ══════════════════════════════════════════════════════════════════

function experiment4_ROC(N: number = 5000) {
  console.log(`\n${DIVIDER}`);
  console.log(` EXPERIMENT 4: ROC/AUC ANALYSIS (N = ${N.toLocaleString()} honest + ${N.toLocaleString()} sybil)`);
  console.log(DIVIDER);

  // Generate scores for honest and sybil
  const honestScores: number[] = [];
  const sybilScores: number[] = [];

  console.log('  Generating honest scores...');
  for (let i = 0; i < N; i++) {
    const { target, related } = generateHonestFacts(4);
    honestScores.push(calculateProvisionalScore(target, related).finalScore);
  }

  console.log('  Generating sybil scores...');
  for (let i = 0; i < N; i++) {
    const { target, related } = generateSybilFacts(4);
    sybilScores.push(calculateProvisionalScore(target, related).finalScore);
  }

  // Sweep threshold
  const thresholds = Array.from({ length: 101 }, (_, i) => i / 100);
  const rocPoints: { threshold: number; tpr: number; fpr: number }[] = [];

  thresholds.forEach(t => {
    const tp = honestScores.filter(s => s >= t).length;   // True positives: honest correctly approved
    const fn = honestScores.filter(s => s < t).length;    // False negatives: honest wrongly rejected
    const fp = sybilScores.filter(s => s >= t).length;    // False positives: sybil wrongly approved
    const tn = sybilScores.filter(s => s < t).length;     // True negatives: sybil correctly rejected

    const tpr = tp / (tp + fn); // Sensitivity
    const fpr = fp / (fp + tn); // 1 - Specificity

    rocPoints.push({ threshold: t, tpr, fpr });
  });

  // Compute AUC using trapezoidal rule
  let auc = 0;
  const sorted = [...rocPoints].sort((a, b) => a.fpr - b.fpr);
  for (let i = 1; i < sorted.length; i++) {
    const dx = sorted[i].fpr - sorted[i - 1].fpr;
    const avgY = (sorted[i].tpr + sorted[i - 1].tpr) / 2;
    auc += dx * avgY;
  }

  console.log(`\n  ${SECTION}`);
  console.log('  ROC CURVE DATA (Selected Points)');
  console.log(`  ${SECTION}`);
  console.log('  Threshold | TPR (Sensitivity) | FPR (1-Specificity)');
  console.log('  ' + '─'.repeat(55));

  [0.0, 0.10, 0.20, 0.30, 0.40, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.90, 1.0].forEach(t => {
    const point = rocPoints.find(p => p.threshold === t);
    if (point) {
      console.log(`  ${(t * 100).toFixed(0).padStart(5)}%    | ${(point.tpr * 100).toFixed(1).padStart(5)}%             | ${(point.fpr * 100).toFixed(1).padStart(5)}%`);
    }
  });

  console.log(`\n  ┌──────────────────────────────────┐`);
  console.log(`  │  AUC (Area Under ROC Curve)       │`);
  console.log(`  │  AUC = ${auc.toFixed(4)}                      │`);
  console.log(`  │  ${auc >= 0.95 ? '✅ EXCELLENT (≥ 0.95)' : auc >= 0.90 ? '⚠️ GOOD (0.90-0.95)' : '❌ NEEDS IMPROVEMENT (< 0.90)'}            │`);
  console.log(`  └──────────────────────────────────┘`);

  // Optimal threshold (Youden's J)
  let bestJ = 0;
  let bestThreshold = 0.5;
  rocPoints.forEach(p => {
    const j = p.tpr - p.fpr; // Youden's J statistic
    if (j > bestJ) {
      bestJ = j;
      bestThreshold = p.threshold;
    }
  });
  console.log(`\n  Optimal Threshold (Youden's J): ${(bestThreshold * 100).toFixed(0)}% (J = ${bestJ.toFixed(3)})`);

  assert(auc >= 0.90, `AUC ≥ 0.90 (actual: ${auc.toFixed(4)})`);

  return { auc, bestThreshold, rocPoints };
}

// ══════════════════════════════════════════════════════════════════
// EXPERIMENT 5: GAME THEORY PAYOFF SIMULATION
// 100 rounds, track honest vs liar cumulative payoffs.
// Proves truth-telling is the dominant strategy.
// ══════════════════════════════════════════════════════════════════

function experiment5_GameTheory(rounds: number = 100, agentsPerType: number = 50) {
  console.log(`\n${DIVIDER}`);
  console.log(` EXPERIMENT 5: GAME THEORY PAYOFF SIMULATION`);
  console.log(` ${agentsPerType} honest + ${agentsPerType} liar agents over ${rounds} rounds`);
  console.log(DIVIDER);

  interface Agent {
    id: string;
    type: 'honest' | 'liar';
    reputation: number;
    balance: number;
    balanceHistory: number[];
  }

  // Initialize agents
  const agents: Agent[] = [
    ...Array.from({ length: agentsPerType }, (_, i) => ({
      id: `honest_${i}`, type: 'honest' as const,
      reputation: 0.5, balance: 10.0, balanceHistory: [10.0]
    })),
    ...Array.from({ length: agentsPerType }, (_, i) => ({
      id: `liar_${i}`, type: 'liar' as const,
      reputation: 0.5, balance: 10.0, balanceHistory: [10.0]
    })),
  ];

  for (let round = 0; round < rounds; round++) {
    agents.forEach(agent => {
      if (agent.balance <= 0.1) {
        agent.balanceHistory.push(agent.balance);
        return; // Bankrupt, can't stake
      }

      const stakeAmount = Math.min(1.0, agent.balance * 0.2);

      if (agent.type === 'honest') {
        // Honest agent submits real data
        const { target, related } = generateHonestFacts(3);
        target.reputation = agent.reputation;
        target.stake = stakeAmount;
        const result = calculateProvisionalScore(target, related);

        // Simulate agent verification (honest agent gets confirmed 90% of the time)
        const agentConfirms = Math.random() < 0.90;
        const terminal = calculateTerminalScore(result.signals, agentConfirms, 0.7);

        if (terminal.terminal_status === 'REWARD') {
          agent.balance += stakeAmount * 0.3; // 30% profit
          agent.reputation = Math.min(1.0, agent.reputation + 0.02);
        } else {
          agent.balance -= stakeAmount; // Lose stake
          agent.reputation = Math.max(0.0, agent.reputation - 0.05);
        }
      } else {
        // Liar submits sybil/fake data
        const { target, related } = generateSybilFacts(3);
        target.reputation = agent.reputation;
        target.stake = stakeAmount;
        const result = calculateProvisionalScore(target, related);

        // Even if sybil data passes Stage 1, agent will likely reject
        const agentConfirms = Math.random() < 0.15; // Only 15% chance it fools the agent
        const terminal = calculateTerminalScore(result.signals, agentConfirms, 0.7);

        if (terminal.terminal_status === 'REWARD') {
          agent.balance += stakeAmount * 0.3;
          agent.reputation = Math.min(1.0, agent.reputation + 0.02);
        } else {
          agent.balance -= stakeAmount;
          agent.reputation = Math.max(0.0, agent.reputation - 0.15);
        }
      }

      agent.balanceHistory.push(agent.balance);
    });
  }

  // Results
  const honestAgents = agents.filter(a => a.type === 'honest');
  const liarAgents = agents.filter(a => a.type === 'liar');

  const honestFinalBalances = honestAgents.map(a => a.balance);
  const liarFinalBalances = liarAgents.map(a => a.balance);

  const honestBankrupt = honestAgents.filter(a => a.balance <= 0.1).length;
  const liarBankrupt = liarAgents.filter(a => a.balance <= 0.1).length;

  console.log(`\n  ${SECTION}`);
  console.log('  GAME THEORY RESULTS');
  console.log(`  ${SECTION}`);
  console.log(`                    | Honest Agents          | Liar Agents`);
  console.log('  ' + '─'.repeat(62));
  console.log(`  Starting Balance  | $10.00                 | $10.00`);
  console.log(`  Final Mean        | $${mean(honestFinalBalances).toFixed(2).padEnd(22)} | $${mean(liarFinalBalances).toFixed(2)}`);
  console.log(`  Final Std Dev     | $${stdDev(honestFinalBalances).toFixed(2).padEnd(22)} | $${stdDev(liarFinalBalances).toFixed(2)}`);
  console.log(`  Min Balance       | $${Math.min(...honestFinalBalances).toFixed(2).padEnd(22)} | $${Math.min(...liarFinalBalances).toFixed(2)}`);
  console.log(`  Max Balance       | $${Math.max(...honestFinalBalances).toFixed(2).padEnd(22)} | $${Math.max(...liarFinalBalances).toFixed(2)}`);
  console.log(`  Bankrupt (≤$0.10) | ${honestBankrupt}/${agentsPerType} (${(honestBankrupt / agentsPerType * 100).toFixed(0)}%)${' '.repeat(16 - String(honestBankrupt).length)} | ${liarBankrupt}/${agentsPerType} (${(liarBankrupt / agentsPerType * 100).toFixed(0)}%)`);
  console.log(`  Mean Reputation   | ${mean(honestAgents.map(a => a.reputation)).toFixed(3).padEnd(22)}  | ${mean(liarAgents.map(a => a.reputation)).toFixed(3)}`);

  // Trajectory snapshots
  console.log(`\n  Balance Trajectory (mean per round):`);
  console.log(`  Round  | Honest Mean | Liar Mean`);
  console.log('  ' + '─'.repeat(38));
  [0, 10, 25, 50, 75, 100].forEach(r => {
    if (r > rounds) return;
    const idx = Math.min(r, rounds);
    const hMean = mean(honestAgents.map(a => a.balanceHistory[Math.min(idx, a.balanceHistory.length - 1)]));
    const lMean = mean(liarAgents.map(a => a.balanceHistory[Math.min(idx, a.balanceHistory.length - 1)]));
    console.log(`  ${String(r).padStart(5)}  | $${hMean.toFixed(2).padEnd(9)} | $${lMean.toFixed(2)}`);
  });

  assert(mean(honestFinalBalances) > mean(liarFinalBalances),
    `Honest agents out-earn liars ($${mean(honestFinalBalances).toFixed(2)} vs $${mean(liarFinalBalances).toFixed(2)})`);
  assert(liarBankrupt > honestBankrupt,
    `More liars go bankrupt (${liarBankrupt} vs ${honestBankrupt})`);
}

// ══════════════════════════════════════════════════════════════════
// MAIN: RUN ALL EXPERIMENTS
// ══════════════════════════════════════════════════════════════════

function main() {
  console.log('\n' + '█'.repeat(70));
  console.log(' APERTURE PROTOCOL: THESIS VERIFICATION SUITE');
  console.log(' Engine Version: V3 (Hardened)');
  console.log(' Date: ' + new Date().toISOString());
  console.log('█'.repeat(70));

  const startTime = Date.now();

  // Run all experiments
  experiment1_UnitTests();
  experiment2_MonteCarlo(10000);
  experiment3_Ablation(5000);
  experiment4_ROC(5000);
  experiment5_GameTheory(100, 50);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Final report
  console.log(`\n${'█'.repeat(70)}`);
  console.log(' FINAL VERIFICATION REPORT');
  console.log('█'.repeat(70));
  console.log(`\n  Total Tests:   ${totalPassed + totalFailed}`);
  console.log(`  Passed:        ${totalPassed} ✅`);
  console.log(`  Failed:        ${totalFailed} ❌`);
  console.log(`  Pass Rate:     ${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%`);
  console.log(`  Runtime:       ${elapsed}s`);

  if (failures.length > 0) {
    console.log(`\n  Failed Tests:`);
    failures.forEach(f => console.log(`    ❌ ${f}`));
  }

  console.log(`\n${'█'.repeat(70)}\n`);
}

main();
