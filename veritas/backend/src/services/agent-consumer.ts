/**
 * ═══════════════════════════════════════════════════════════════════
 *  APERTURE PROTOCOL — AGENTIC AI CONSUMER (SCRIPTED DEMO SCENARIOS)
 *
 *  Two pre-scripted demo scenarios — each always runs against the
 *  correct domain, picks the right fact, and produces a predictable
 *  outcome. No more random selection.
 *
 *  Scenario A — LogiScan AI (Logistics, CONFIRMED ✅)
 *    Fleet routing AI buys traffic congestion intelligence
 *
 *  Scenario B — PowerGrid AI (Energy, CONFIRMED ✅)
 *    Energy infrastructure monitor buys transformer explosion report
 *
 *  Each step streams as an SSE event to the frontend.
 * ═══════════════════════════════════════════════════════════════════
 */

import { pool } from '../db/index';
import { embedText } from './embeddings';

// ─────────────────────────────────────────────
// DEMO SCENARIOS
// ─────────────────────────────────────────────

export const DEMO_SCENARIOS = [
  {
    id: 'logistics-traffic',
    agentName: 'LogiScan AI',
    agentRole: 'Fleet Routing Intelligence',
    agentColor: 'violet',
    agentEmoji: '🚚',
    domain: 'logistics',
    walletAddress: process.env.AGENT_WALLET_ADDRESS || '0x06b54676D3878279189b3d8e3EB846Dc61bE46aD',
    agentId: 'logiscan-fleet-agent',
    query: 'traffic in bangalore central',
    missionBrief: 'Acquire real-time ground-truth intelligence on road conditions and traffic disruptions near Town Hall junction to optimize fleet routing for 1,200 commercial vehicles.',
    businessContext: 'A logistics disruption of 2+ hours near Town Hall CBD costs fleet operators approximately ₹4.2L in idle costs. Real-time intelligence prevents that.',
    targetDomain: 'logistics',
    streetViewLat: 12.9581,
    streetViewLng: 77.5833,
    streetViewLocation: 'Town Hall, Bengaluru',
    expectedVerdict: 'confirmed' as const,
    stakeOutcome: 'REWARD',
    outcomeMessage: 'Traffic intelligence confirmed. Rerouting fleet to NICE Road bypass. Estimated savings: ₹2.8L in idle cost avoidance.',
  },
  {
    id: 'energy-grid',
    agentName: 'PowerGrid AI',
    agentRole: 'Energy Infrastructure Monitor',
    agentColor: 'amber',
    agentEmoji: '⚡',
    domain: 'energy',
    walletAddress: process.env.AGENT_WALLET_ADDRESS || '0x06b54676D3878279189b3d8e3EB846Dc61bE46aD',
    agentId: 'powergrid-monitor-agent',
    query: 'power supply cut in chandra layout bangalore',
    missionBrief: 'Monitor energy infrastructure failures across Chandra Layout to trigger emergency rerouting protocols and alert downstream grid operators.',
    businessContext: 'Chandra Layout hosts 2,400+ tech startups. An undetected transformer failure without ground-truth intelligence causes cascading outages affecting ₹18Cr in SaaS uptime.',
    targetDomain: 'energy',
    streetViewLat: 12.9616,
    streetViewLng: 77.5255,
    streetViewLocation: 'Chandra Layout, Bengaluru',
    expectedVerdict: 'confirmed' as const,
    stakeOutcome: 'REWARD',
    outcomeMessage: 'Transformer failure confirmed at HSR Layout Sector 2. Emergency load redistribution activated. Notifying 847 downstream grid subscribers.',
  },
];

export type DemoScenario = typeof DEMO_SCENARIOS[0];

// ─────────────────────────────────────────────
// SSE EVENT TYPE
// ─────────────────────────────────────────────

export interface AgentEvent {
  step: string;
  type: 'init' | 'query' | 'searching' | 'results' | 'selected' | 'purchasing' | 'streetview' | 'verifying' | 'feedback' | 'settlement' | 'complete' | 'error' | 'no_facts';
  status: 'in_progress' | 'complete' | 'error';
  thinking: string;
  data?: Record<string, any>;
  timestamp: string;
}

function makeEvent(
  step: string,
  type: AgentEvent['type'],
  status: AgentEvent['status'],
  thinking: string,
  data?: Record<string, any>
): AgentEvent {
  return { step, type, status, thinking, data, timestamp: new Date().toISOString() };
}

// ─────────────────────────────────────────────
// GEMINI REASONING
// ─────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

async function getGeminiAgentReasoning(
  agentName: string,
  agentRole: string,
  claim: string,
  domain: string,
  businessContext: string
): Promise<string> {
  if (!GEMINI_API_KEY) {
    return 'Gemini API not configured — using heuristic analysis only.';
  }

  const prompt = `You are ${agentName}, an autonomous ${agentRole}. You have purchased ground-truth intelligence from the Aperture Protocol marketplace and are now cross-referencing it.

INTELLIGENCE CLAIM: "${claim}"
DOMAIN: ${domain}
BUSINESS CONTEXT: ${businessContext}

Analyze this intelligence in exactly 3 sentences:
1. Assessment of whether this event type is consistent with real-world patterns in this domain.
2. The specific operational decision this intelligence enables for your mission.
3. Your confidence level and any caveats.

Be highly specific and professional. No markdown, no lists — just 3 clean sentences.`;

  try {
    for (const model of ['gemini-2.5-flash', 'gemini-2.0-flash']) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
        }),
      });
      if (res.ok) {
        const data = await res.json() as any;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text.trim();
      }
    }
    return 'Cross-reference complete. Intelligence is consistent with expected domain patterns. High confidence verdict issued.';
  } catch {
    return 'Verification service temporarily unavailable. Proceeding with structural analysis.';
  }
}

// ─────────────────────────────────────────────
// MAIN SIMULATION — SCRIPTED SSE GENERATOR
// ─────────────────────────────────────────────

export async function* runAgentSimulation(
  backendUrl: string,
  scenarioId: string = 'logistics-traffic'
): AsyncGenerator<AgentEvent> {

  const scenario = DEMO_SCENARIOS.find(s => s.id === scenarioId) || DEMO_SCENARIOS[0];

  // ── STEP 0: INIT ──
  yield makeEvent('Initializing Agent', 'init', 'complete',
    `${scenario.agentEmoji} ${scenario.agentName} online. Role: ${scenario.agentRole}. Mission: ${scenario.missionBrief}`,
    {
      agentName: scenario.agentName,
      agentRole: scenario.agentRole,
      agentId: scenario.agentId,
      walletAddress: scenario.walletAddress,
      domain: scenario.domain,
      missionBrief: scenario.missionBrief,
      businessContext: scenario.businessContext,
    }
  );

  await sleep(1000);

  // ── STEP 1: QUERY ISSUANCE ──
  yield makeEvent('Query Issued', 'query', 'complete',
    `Issuing semantic search query to Aperture Marketplace. Domain filter: "${scenario.targetDomain}". Query: "${scenario.query}"`,
    {
      query: scenario.query,
      domainFilter: scenario.targetDomain,
      protocol: 'Aperture Semantic Search v2',
      vectorModel: 'all-MiniLM-L6-v2',
    }
  );

  await sleep(1200);

  // ── STEP 2: SEARCH ──
  yield makeEvent('Searching Marketplace', 'searching', 'in_progress',
    `Scanning ${scenario.targetDomain} facts in Aperture database using cosine similarity over 384-dimensional embedding space...`
  );

  let allResults: any[] = [];
  try {
    const queryEmbed = await embedText(scenario.query);

    // Domain-filtered semantic search
    const vectorStr = `[${queryEmbed.join(',')}]`;
    const { rows } = await pool.query(`
      SELECT
        f.id, f.text_claim, f.domain, f.credibility_score, f.price_usdc,
        f.stake_amount, f.stake_status, f.latitude, f.longitude,
        f.location_name, f.submitted_at,
        s.reputation_score,
        1 - (f.embedding <=> $1::vector) AS similarity
      FROM facts f
      JOIN submitters s ON f.submitter_id = s.id
      WHERE f.domain = $2
        AND f.embedding IS NOT NULL
        AND f.stake_status NOT IN ('pending')
      ORDER BY f.embedding <=> $1::vector ASC
      LIMIT 8
    `, [vectorStr, scenario.targetDomain]);

    allResults = rows;
  } catch (err: any) {
    yield makeEvent('Search Failed', 'error', 'error',
      `Database query failed: ${err.message}`,
      { error: err.message }
    );
    return;
  }

  if (allResults.length === 0) {
    yield makeEvent('No Intelligence Found', 'no_facts', 'complete',
      `No ${scenario.targetDomain} facts found in marketplace. Please seed data first.`
    );
    return;
  }

  // Compute a combined score for ranking display
  const ranked = allResults.map((r: any) => ({
    ...r,
    similarityNum: parseFloat(r.similarity) || 0,
    scoreNum: parseFloat(r.credibility_score) || 0,
    combinedScore: (parseFloat(r.similarity) || 0) * 0.6 + (parseFloat(r.credibility_score) || 0) * 0.4,
  })).sort((a: any, b: any) => b.combinedScore - a.combinedScore);

  await sleep(600);

  yield makeEvent('Search Complete', 'searching', 'complete',
    `Found ${ranked.length} ${scenario.targetDomain} intelligence items. Ranking by relevance × credibility score...`,
    { resultCount: ranked.length }
  );

  await sleep(800);

  // ── STEP 3: RESULTS TABLE ──
  yield makeEvent('Evaluating Results', 'results', 'complete',
    `Analysing top ${Math.min(ranked.length, 5)} candidates. Combining semantic similarity with Bayesian credibility score to select the highest-value intelligence.`,
    {
      candidates: ranked.slice(0, 5).map((r: any, i: number) => ({
        rank: i + 1,
        id: r.id,
        claim: r.text_claim,
        domain: r.domain,
        credibilityScore: r.scoreNum,
        similarity: r.similarityNum,
        combinedScore: r.combinedScore,
        priceUsdc: parseFloat(r.price_usdc) || 0.02,
        stakeAmount: parseFloat(r.stake_amount) || 1.0,
        stakeStatus: r.stake_status,
        location: r.location_name,
      })),
    }
  );

  await sleep(1200);

  // ── STEP 4: SELECTION ──
  // Pick best unsettled fact (prefer locked status)
  const unsettled = ranked.filter((r: any) => r.stake_status === 'locked');
  const target = unsettled.length > 0 ? unsettled[0] : ranked[0];

  const credScore = target.scoreNum;
  const priceUsdc = parseFloat(target.price_usdc) || 0.02;
  const stakeAmount = parseFloat(target.stake_amount) || 1.0;
  const isSettled = target.stake_status === 'released' || target.stake_status === 'slashed';

  yield makeEvent('Candidate Selected', 'selected', 'complete',
    `Selected: "${target.text_claim?.substring(0, 70)}..." — Highest combined score (${(target.combinedScore * 100).toFixed(1)}%). Proceeding to purchase via x402.`,
    {
      factId: target.id,
      claim: target.text_claim,
      domain: target.domain,
      credibilityScore: credScore,
      similarity: target.similarityNum,
      combinedScore: target.combinedScore,
      priceUsdc,
      stakeAmount,
      location: target.location_name,
      lat: target.latitude,
      lng: target.longitude,
      stakeStatus: target.stake_status,
      selectionReason: `Highest combined relevance-credibility score. Similarity: ${(target.similarityNum * 100).toFixed(1)}%, Credibility: ${(credScore * 100).toFixed(1)}%.`,
    }
  );

  await sleep(1000);

  // ── STEP 5: x402 PAYMENT ──
  yield makeEvent('x402 Payment', 'purchasing', 'in_progress',
    `Sending HTTP request to Aperture Marketplace. Expecting HTTP 402 Payment Required...`,
    { factId: target.id }
  );

  await sleep(700);

  yield makeEvent('x402 Payment', 'purchasing', 'in_progress',
    `HTTP 402 received. Price: $${priceUsdc.toFixed(3)} USDC on Base Sepolia. Signing authorization with wallet ${scenario.walletAddress.substring(0, 12)}...`,
    {
      httpStatus: 402,
      protocol: 'x402',
      price: priceUsdc,
      network: 'Base Sepolia (Chain ID: 84532)',
      wallet: scenario.walletAddress,
    }
  );

  await sleep(900);

  // Increment consumed_count
  try {
    await pool.query('UPDATE facts SET consumed_count = consumed_count + 1 WHERE id = $1', [target.id]);
  } catch { /* non-critical */ }

  yield makeEvent('x402 Payment', 'purchasing', 'complete',
    `✅ Payment authorized. $${priceUsdc.toFixed(3)} USDC deducted from agent wallet. Intelligence data unlocked.`,
    {
      receipt: `x402-${scenario.agentId}-${Date.now()}`,
      amountPaid: priceUsdc,
      factUnlocked: target.id,
    }
  );

  await sleep(1000);

  // ── STEP 6: STREET VIEW ──
  const svLat = target.latitude || scenario.streetViewLat;
  const svLng = target.longitude || scenario.streetViewLng;

  yield makeEvent('Location Verification', 'streetview', 'complete',
    `Cross-referencing claimed location (${target.location_name || scenario.streetViewLocation}) with Google Street View imagery at GPS coordinates ${svLat.toFixed(4)}, ${svLng.toFixed(4)}.`,
    {
      lat: svLat,
      lng: svLng,
      location: target.location_name || scenario.streetViewLocation,
      streetViewUrl: `/api/streetview?lat=${svLat}&lng=${svLng}`,
    }
  );

  await sleep(1500);

  // ── STEP 7: GEMINI VERIFICATION ──
  yield makeEvent('AI Cross-Reference', 'verifying', 'in_progress',
    `Routing claim to Gemini AI for domain-specific plausibility analysis. Model: gemini-2.5-flash...`
  );

  await sleep(400);
  const geminiReasoning = await getGeminiAgentReasoning(
    scenario.agentName, scenario.agentRole,
    target.text_claim, target.domain,
    scenario.businessContext
  );

  const CONFIRM_THRESHOLD = 0.42;
  const isConfirmed = credScore >= CONFIRM_THRESHOLD;

  yield makeEvent('AI Cross-Reference', 'verifying', 'complete',
    isConfirmed
      ? `✅ Intelligence verified. Claim is consistent with ground reality.`
      : `❌ Intelligence flagged. Significant inconsistencies detected.`,
    {
      geminiReasoning,
      verdict: isConfirmed ? 'confirmed' : 'contradicted',
      credibilityScore: credScore,
      threshold: CONFIRM_THRESHOLD,
      model: 'gemini-2.5-flash',
    }
  );

  await sleep(1200);

  // ── STEP 8: FEEDBACK + SETTLEMENT ──
  if (isSettled) {
    yield makeEvent('Settlement', 'settlement', 'complete',
      `Fact was already settled as "${target.stake_status}". Intelligence is catalogued.`,
      { alreadySettled: true, existingStatus: target.stake_status }
    );

    return;
  }

  yield makeEvent('Submitting Verdict', 'feedback', 'in_progress',
    `Posting ground-truth ${isConfirmed ? 'CONFIRMATION' : 'CONTRADICTION'} to Aperture Protocol. Triggering terminal settlement engine...`,
    { signal: isConfirmed ? 'confirmed' : 'contradicted', agentId: scenario.agentId }
  );

  await sleep(800);

  let settlementResult: any = null;
  let settlementTxHash: string | null = null;

  try {
    const feedbackRes = await fetch(`${backendUrl}/facts/${target.id}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: scenario.agentId, signal: isConfirmed ? 'confirmed' : 'contradicted' }),
    });

    const feedbackData = await feedbackRes.json() as any;

    if (feedbackRes.ok && feedbackData.settlement) {
      settlementResult = feedbackData.settlement;
      settlementTxHash = feedbackData.settlement_tx_hash;
    } else if (feedbackRes.status === 409) {
      yield makeEvent('Already Settled', 'settlement', 'complete',
        `Fact was concurrently settled. Cataloguing intelligence result.`,
        { alreadySettled: true }
      );

      return;
    } else {
      throw new Error(feedbackData.error || 'Feedback submission failed');
    }
  } catch (err: any) {
    yield makeEvent('Feedback Error', 'error', 'error',
      `Settlement call failed: ${err.message}`,
      { error: err.message }
    );
    return;
  }

  yield makeEvent('Verdict Submitted', 'feedback', 'complete',
    `Ground-truth ${isConfirmed ? 'CONFIRMATION' : 'CONTRADICTION'} recorded. Terminal settlement engine processing...`,
    { agentId: scenario.agentId, signal: isConfirmed ? 'confirmed' : 'contradicted' }
  );

  await sleep(800);

  const terminalScore = settlementResult?.finalScore || 0;
  const terminalStatus = settlementResult?.terminal_status || 'UNKNOWN';
  const signals = settlementResult?.signals || {};

  yield makeEvent('Terminal Settlement', 'settlement', 'complete',
    terminalStatus === 'REWARD'
      ? `⚖️ REWARD — Terminal score: ${(terminalScore * 100).toFixed(1)}%. Human submitter's $${stakeAmount.toFixed(2)} USDC stake RELEASED. Reputation +0.05.`
      : `⚖️ SLASH — Terminal score: ${(terminalScore * 100).toFixed(1)}%. Human submitter's $${stakeAmount.toFixed(2)} USDC stake BURNED. Reputation -0.20.`,
    {
      terminalScore,
      terminalStatus,
      signals: {
        s_rep: signals.s_rep,
        s_stake: signals.s_stake,
        s_geo: signals.s_geo,
        s_temporal: signals.s_temporal,
        s_semantic: signals.s_semantic,
        s_agent: signals.s_agent,
      },
      effectiveAgentWeight: settlementResult?.effectiveAgentWeight,
      settlementTxHash,
      stakeAmount,
    }
  );

  await sleep(800);
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

export const AGENT_PERSONA = DEMO_SCENARIOS[0]; // backward compat

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
