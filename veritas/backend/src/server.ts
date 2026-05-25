import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

// Assuming you will add these helper functions to your db/index.ts next
import { 
  insertFact, getFactById, semanticSearch, getAllFacts, upsertSubmitter, 
  getAgentTrustScore, updateAgentTrustScore, updateFactStatus, updateSubmitterReputation,
  insertCredibilitySignals, getCredibilitySignals, parsePgVector, isValidWalletAddress, pool
} from './db/index';
import { embedText } from './services/embeddings';
import { calculateProvisionalScore, calculateTerminalScore, FactData } from './services/credibility';
import { 
  getStakeTransactionData, releaseStakeOnChain, slashStakeOnChain, 
  getStakeOnChain, getBlockchainStatus, getUsdcBalance, getTotalLocked,
  verifyStakeTransaction 
} from './services/blockchain';
import { verifyImageTextCoherence, CoherenceResult } from './services/image-verify';
import { runAgentSimulation, AGENT_PERSONA, DEMO_SCENARIOS } from './services/agent-consumer';

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// RUNTIME DEMO CONFIG (toggleable without restart)
// ─────────────────────────────────────────────
let demoConfig = {
  imageVerificationEnabled: true,   // Toggle Gemini + Street View pipeline
  heuristicEngineEnabled: true,     // Toggle 6-signal Bayesian credibility engine
};

// In-memory store for the latest verification attempt (shown in Verification Viewer)
// Stores BOTH accepted and rejected submissions so the web dashboard can display
// verification data for facts submitted from the Flutter app.
let latestVerification: {
  timestamp: string;
  textClaim: string;
  domain: string;
  outcome: 'accepted' | 'rejected' | 'skipped';
  coherence: any;
  heuristic: any;
  edgeCases: string[];
  factId: string | null;
} | null = null;

// Ensure verification_details JSONB column exists (safe to run repeatedly)
async function ensureVerificationColumn() {
  try {
    await pool.query(`
      ALTER TABLE facts ADD COLUMN IF NOT EXISTS verification_details JSONB DEFAULT NULL
    `);
    console.log('✅ [DB] verification_details column ready');
  } catch (err: any) {
    console.warn('⚠️ [DB] Could not add verification_details column:', err.message);
  }
}
ensureVerificationColumn();

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint (required for production monitoring & deployment)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: '3.0.0' });
});

const uploadDir = './uploads/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, `fact-evidence-${Date.now()}${path.extname(file.originalname)}`);
  }
});
const upload = multer({ storage });

// ─────────────────────────────────────────────
// THE x402 PROTOCOL MIDDLEWARE (Dynamic Pricing)
// ─────────────────────────────────────────────
async function x402Paywall(req: any, res: any, next: any) {
  const factId = req.params.id;
  const agentId = req.headers['x-agent-id'] || 'anonymous_scout';
  const paymentReceipt = req.headers['x-payment-receipt'];

  if (!paymentReceipt) {
    const fact = await getFactById(factId);
    if (!fact) return res.status(404).json({ error: 'Fact not found' });

    // 1. Fetch Agent Trust Score (Default to 0.5 for new agents)
    const agentTrust = await getAgentTrustScore(agentId) || 0.5;
    
    // 2. Dynamic Pricing Math (Reputation Premium)
    const basePrice = fact.price_usdc || 0.05;
    const penaltyMultiplier = 1 + (Math.pow(1 - agentTrust, 2) / 0.5);
    const dynamicPrice = basePrice * penaltyMultiplier;

    console.log(`🛑 [x402] Paywall hit by ${agentId}. Trust: ${agentTrust.toFixed(2)}. Price: $${dynamicPrice.toFixed(3)} USDC`);
    
    return res.status(402).json({
      error: 'Payment Required',
      x402: {
        version: '1.0',
        accepts: [{
          network: 'arc-testnet',
          asset: 'USDC',
          amount: parseFloat(dynamicPrice.toFixed(4)), // Dynamically priced
          payTo: process.env.CIRCLE_WALLET_ADDRESS || '0xApertureProtocol',
          description: `Unlock Aperture Intelligence: ${fact.id}`
        }]
      }
    });
  }

  // (Production: Verify the cryptographic receipt here)
  console.log(`💸 [x402] Payment verified for receipt: ${paymentReceipt}`);
  req.payment_verified = true;
  req.agent_id = req.headers['x-agent-id'] || 'anonymous_scout';
  return next();
}

// ─────────────────────────────────────────────
// PUBLIC API ROUTES
// ─────────────────────────────────────────────

app.get('/facts', async (req, res) => {
  try {
    const walletAddress = req.query.address as string | undefined;
    const facts = await getAllFacts(walletAddress);
    res.json({ facts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DEMO CONFIG API (Runtime toggles — no restart needed)
// ─────────────────────────────────────────────
app.get('/demo/config', (req, res) => {
  res.json({ config: demoConfig });
});

app.post('/demo/config', (req, res) => {
  const { imageVerificationEnabled, heuristicEngineEnabled } = req.body;
  if (imageVerificationEnabled !== undefined) {
    demoConfig.imageVerificationEnabled = !!imageVerificationEnabled;
    console.log(`🎛️  [Demo Config] Image Verification: ${demoConfig.imageVerificationEnabled ? 'ON ✅' : 'OFF ❌'}`);
  }
  if (heuristicEngineEnabled !== undefined) {
    demoConfig.heuristicEngineEnabled = !!heuristicEngineEnabled;
    console.log(`🎛️  [Demo Config] Heuristic Engine: ${demoConfig.heuristicEngineEnabled ? 'ON ✅' : 'OFF ❌'}`);
  }
  res.json({ config: demoConfig });
});

// Latest verification result (for Verification Viewer — works with Flutter submissions)
app.get('/verification/latest', (req, res) => {
  res.json({ verification: latestVerification });
});

// ─────────────────────────────────────────────
// EDGE CASE DETECTION (from Gemini reasoning text)
// ─────────────────────────────────────────────
function detectEdgeCases(reasoning: string): string[] {
  const cases: string[] = [];
  const lower = reasoning.toLowerCase();
  if (lower.includes('indoor') || lower.includes('inside'))
    cases.push('indoor');
  if (lower.includes('close-up') || lower.includes('macro') || lower.includes('close up'))
    cases.push('close-up');
  if (lower.includes('night') || lower.includes('dark') || lower.includes('dusk') || lower.includes('dawn'))
    cases.push('night');
  if (lower.includes('weather') || lower.includes('rain') || lower.includes('fog') || lower.includes('snow'))
    cases.push('weather');
  if (lower.includes('construction') || lower.includes('demolition') || lower.includes('new building'))
    cases.push('construction');
  if (lower.includes('generic') || lower.includes('could exist anywhere') || lower.includes('not geographically distinctive'))
    cases.push('generic-scene');
  if (lower.includes('street-level comparison is not applicable') || lower.includes('street view cannot'))
    cases.push('sv-not-applicable');
  return cases;
}

app.get('/facts/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

    const queryEmbedding = await embedText(q);
    const results = await semanticSearch(queryEmbedding, 0.2, 5);
    res.json({ results, count: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 1. STAGE 1: HUMAN SUBMITS FACT (Uses Multer for multipart/form-data)
app.post('/facts', upload.single('image'), async (req, res) => {
  try {
    const { text_claim, domain, wallet_address, stake_amount, latitude, longitude } = req.body;
    
    if (!text_claim || !wallet_address || !latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required fields or GPS data' });
    }

    // FIX: Validate wallet address format
    if (!isValidWalletAddress(wallet_address)) {
      return res.status(400).json({ error: 'Invalid wallet address. Expected format: 0x + 40 hex characters.' });
    }

    // FIX: Validate domain against allowed values
    const allowedDomains = ['financial', 'logistics', 'agricultural', 'maritime-logistics', 'energy', 'infrastructure'];
    if (!domain || !allowedDomains.includes(domain)) {
      return res.status(400).json({ error: `Invalid domain. Must be one of: ${allowedDomains.join(', ')}` });
    }

    // FIX: Validate stake amount to prevent NaN from Math.sqrt(negative)
    const parsedStake = parseFloat(stake_amount);
    if (isNaN(parsedStake) || parsedStake <= 0) {
      return res.status(400).json({ error: 'stake_amount must be a positive number' });
    }

    const submitter = await upsertSubmitter(wallet_address);
    const embedding = await embedText(text_claim);
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // ── MULTIMODAL EVIDENCE VERIFICATION (Gemini + Street View) ──
    // Controlled by demoConfig.imageVerificationEnabled toggle
    let coherenceResult: CoherenceResult | null = null;
    if (req.file) {
      if (demoConfig.imageVerificationEnabled) {
        const absoluteImagePath = path.resolve(req.file.path);
        coherenceResult = await verifyImageTextCoherence(
          absoluteImagePath, 
          text_claim, 
          domain,
          parseFloat(latitude),
          parseFloat(longitude)
        );
        
        // ── TWO-TIER REJECTION LOGIC ──
        // TEXT MATCH is a HARD GATE: if the image is unrelated to the claim, reject immediately
        // regardless of confidence. A laptop photo is never evidence of a fire.
        // DOMAIN and LOCATION checks use a confidence threshold (>0.6) to avoid false positives.
        const textMatchFailed = !coherenceResult.text_match;
        const softCheckFailed = (!coherenceResult.domain_match || !coherenceResult.location_plausible) 
                                && coherenceResult.confidence > 0.6;
        
        if (textMatchFailed || softCheckFailed) {
          const failures: string[] = [];
          if (!coherenceResult.text_match) failures.push('image does not match claim');
          if (!coherenceResult.domain_match) failures.push('domain mismatch');
          if (!coherenceResult.location_plausible) failures.push('location mismatch');
          const failureSummary = failures.join(', ') || 'verification failed';
          
          // Detect edge cases from Gemini reasoning for frontend display
          const edgeCases = detectEdgeCases(coherenceResult.reasoning || '');

          const rejectionCoherence = {
            coherent: false,
            confidence: coherenceResult.confidence,
            reasoning: coherenceResult.reasoning,
            text_match: coherenceResult.text_match,
            domain_match: coherenceResult.domain_match,
            location_plausible: coherenceResult.location_plausible,
            verification_mode: coherenceResult.verification_mode,
            streetViewUrls: coherenceResult.streetViewUrls,
            geminiReasoning: coherenceResult.geminiReasoning,
            geminiModel: coherenceResult.geminiModel,
            latencyMs: coherenceResult.latencyMs,
          };

          // Store for Verification Viewer (even rejected submissions)
          latestVerification = {
            timestamp: new Date().toISOString(),
            textClaim: text_claim,
            domain,
            outcome: 'rejected',
            coherence: rejectionCoherence,
            heuristic: null,
            edgeCases,
            factId: null,
          };
          console.log(`🚫 [API] Evidence rejected (${failureSummary}): ${coherenceResult.reasoning}`);
          return res.status(400).json({
            error: `Evidence verification failed: ${failureSummary}`,
            coherence: rejectionCoherence,
          });
        }
      } else {
        // Image verification disabled — skip with demo result
        console.log('⏭️  [Demo Config] Image verification SKIPPED (toggle OFF)');
        coherenceResult = {
          coherent: true, confidence: 0, reasoning: 'Verification skipped (demo mode — toggle OFF)',
          text_match: true, domain_match: true, location_plausible: true,
          verification_mode: 'skipped',
          streetViewUrls: [], geminiReasoning: undefined, geminiModel: undefined, latencyMs: undefined
        };
      }
    }

    // Build the Target Fact Data for the Engine
    const targetFact = {
      id: "temp-id", embedding, reputation: submitter.reputation_score,
      stake: parsedStake, latitude: parseFloat(latitude), 
      longitude: parseFloat(longitude), timestamp: Date.now(), domain
    };

    // Fetch recent facts to compare against
    const searchResults = await semanticSearch(embedding, 0.1, 10);

    // FIX: Transform DB rows into proper FactData objects.
    const relatedFacts: FactData[] = searchResults.map((r: any) => ({
      id: r.id,
      embedding: parsePgVector(r.embedding),
      reputation: parseFloat(r.reputation_score) || 0.5,
      stake: parseFloat(r.stake_amount) || 0,
      latitude: parseFloat(r.latitude) || 0,
      longitude: parseFloat(r.longitude) || 0,
      timestamp: r.submitted_at ? new Date(r.submitted_at).getTime() : Date.now()
    }));

    // Run STAGE 1 Math (or skip if heuristic engine is disabled)
    let provisionalResult;
    if (demoConfig.heuristicEngineEnabled) {
      provisionalResult = calculateProvisionalScore(targetFact, relatedFacts);

      if (provisionalResult.status === 'REJECTED_SYBIL_SUSPECT') {
        if (process.env.NODE_ENV === 'test' || process.env.BYPASS_SYBIL === 'true' || process.env.DEMO_MODE === 'true') {
          console.log("⚠️ [Demo/Test Mode] Bypassing Sybil/Bot detection so scenario can continue.");
        } else {
          return res.status(403).json({ error: 'Rejected: Sybil/Bot behavior detected.', score: provisionalResult.finalScore });
        }
      }
    } else {
      // Heuristic engine disabled — use fixed placeholder score
      console.log('⏭️  [Demo Config] Heuristic engine SKIPPED (toggle OFF)');
      provisionalResult = {
        finalScore: 0.50,
        status: 'PENDING_CORROBORATION',
        signals: { s_rep: 0.5, s_stake: 0.5, s_geo: 0.5, s_temporal: 0.5, s_semantic: 0.5 }
      };
    }

    // PENDING_CORROBORATION: Allow into market but at discounted price
    const priceUsdc = provisionalResult.status === 'PENDING_CORROBORATION' ? 0.02 : 0.05;

    // Save approved fact to DB
    const newFact = await insertFact({
      submitter_id: submitter.id, text_claim, domain, 
      latitude: parseFloat(latitude), longitude: parseFloat(longitude),
      stake_amount: parsedStake, image_url: imageUrl,
      credibility_score: provisionalResult.finalScore, embedding,
      price_usdc: priceUsdc, staker_address: wallet_address 
    });

    // FIX: Persist the REAL provisional signals so Stage 2 can use them
    await insertCredibilitySignals(newFact.id, provisionalResult.signals);

    // Store full verification details as JSONB for the Verification Viewer
    const verificationDetails = {
      coherence: coherenceResult ? {
        coherent: coherenceResult.coherent,
        confidence: coherenceResult.confidence,
        reasoning: coherenceResult.reasoning,
        text_match: coherenceResult.text_match,
        domain_match: coherenceResult.domain_match,
        location_plausible: coherenceResult.location_plausible,
        verification_mode: coherenceResult.verification_mode,
        streetViewUrls: coherenceResult.streetViewUrls,
        geminiReasoning: coherenceResult.geminiReasoning,
        geminiModel: coherenceResult.geminiModel,
        latencyMs: coherenceResult.latencyMs,
      } : null,
      heuristic: {
        enabled: demoConfig.heuristicEngineEnabled,
        signals: provisionalResult.signals,
        finalScore: provisionalResult.finalScore,
        status: provisionalResult.status,
      },
      toggles: { ...demoConfig },
      timestamp: new Date().toISOString(),
    };
    try {
      await pool.query('UPDATE facts SET verification_details = $1 WHERE id = $2', [
        JSON.stringify(verificationDetails), newFact.id
      ]);
    } catch (err: any) {
      console.warn('⚠️ [DB] Failed to store verification_details:', err.message);
    }

    // DEMO MODE: Auto-lock facts so they appear in the marketplace immediately
    if (process.env.DEMO_MODE === 'true') {
      await pool.query("UPDATE facts SET stake_status = 'locked' WHERE id = $1", [newFact.id]);
      console.log(`🎭 [Demo Mode] Auto-locked fact ${newFact.id.substring(0,8)} (skipping on-chain confirmation)`);
    }

    // Generate the on-chain staking transaction data for the Flutter app
    let stakeTransactions = null;
    try {
      stakeTransactions = getStakeTransactionData(newFact.id, parsedStake);
      console.log(`⛓️  [Blockchain] Stake TX data generated for fact ${newFact.id.substring(0,8)}`);
    } catch (err: any) {
      console.warn(`⚠️  [Blockchain] Skipping on-chain stake (not configured): ${err.message}`);
    }

    const successCoherence = coherenceResult ? {
      coherent: coherenceResult.coherent,
      confidence: coherenceResult.confidence,
      reasoning: coherenceResult.reasoning,
      text_match: coherenceResult.text_match,
      domain_match: coherenceResult.domain_match,
      location_plausible: coherenceResult.location_plausible,
      verification_mode: coherenceResult.verification_mode,
      streetViewUrls: coherenceResult.streetViewUrls,
      geminiReasoning: coherenceResult.geminiReasoning,
      geminiModel: coherenceResult.geminiModel,
      latencyMs: coherenceResult.latencyMs,
    } : null;

    const successHeuristic = {
      enabled: demoConfig.heuristicEngineEnabled,
      signals: provisionalResult.signals,
      finalScore: provisionalResult.finalScore,
      status: provisionalResult.status,
    };

    // Store for Verification Viewer (accepted submissions)
    const edgeCases = detectEdgeCases(coherenceResult?.reasoning || '');
    latestVerification = {
      timestamp: new Date().toISOString(),
      textClaim: text_claim,
      domain,
      outcome: coherenceResult ? 'accepted' : 'skipped',
      coherence: successCoherence,
      heuristic: successHeuristic,
      edgeCases,
      factId: newFact.id,
    };

    console.log(`✅ [API] Fact Staked: ${newFact.id} | Status: ${provisionalResult.status} | Score: ${(provisionalResult.finalScore * 100).toFixed(1)}%`);
    res.status(201).json({ 
      id: newFact.id, 
      credibility_score: provisionalResult.finalScore, 
      status: provisionalResult.status,
      stakeTransactions,
      coherence: successCoherence,
      heuristic: successHeuristic,
      message: provisionalResult.status === 'PENDING_CORROBORATION' 
        ? 'Fact staked — awaiting corroboration from other submitters' 
        : 'Fact staked and indexed'
    });
  } catch (err: any) {
    console.error("❌ [CRITICAL API ERROR]:", err);
    res.status(500).json({ error: err.message || "Unknown Server Error - Check Terminal" });
  }
});

// 1b. CONFIRM ON-CHAIN STAKE (Flutter calls this after the human signs the tx)
app.post('/facts/:id/confirm-stake', async (req, res) => {
  try {
    const factId = req.params.id;
    const { stake_tx_hash } = req.body;
    if (!stake_tx_hash) return res.status(400).json({ error: 'stake_tx_hash required' });

    console.log(`⏱️  [Blockchain] Verifying stake transaction ${stake_tx_hash.substring(0,16)}...`);
    const isSuccess = await verifyStakeTransaction(stake_tx_hash);
    
    if (!isSuccess) {
      // Transaction failed on-chain (e.g. out of gas or reverted)
      // Fact remains in 'pending' status and is ignored by the marketplace.
      return res.status(400).json({ error: 'Transaction failed or reverted on chain' });
    }

    // Store the on-chain transaction hash and mark as locked
    await pool.query(
      'UPDATE facts SET stake_tx_hash = $1, stake_status = $2 WHERE id = $3',
      [stake_tx_hash, 'locked', factId]
    );
    console.log(`⛓️  [Blockchain] Stake confirmed on-chain for ${factId.substring(0,8)} | TX: ${stake_tx_hash.substring(0,16)}...`);
    res.json({ success: true, stake_tx_hash, status: 'locked' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. AGENT BUYS FACT
app.get('/facts/:id', x402Paywall, async (req: any, res) => {
  try {
    const fact = await getFactById(req.params.id);
    console.log(`🔓 [API] Unlocked fact ${fact.id} for Agent: ${req.agent_id}`);
    
    // FIX: Track market demand — increment consumed_count when agents buy data
    await pool.query('UPDATE facts SET consumed_count = consumed_count + 1 WHERE id = $1', [req.params.id]);

    res.json({
      success: true,
      fact: {
        id: fact.id, text_claim: fact.text_claim, domain: fact.domain,
        verified_at: fact.submitted_at, image_url: fact.image_url
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. STAGE 2: AGENT FEEDBACK & TERMINAL SETTLEMENT (The MLOps Loop)
app.post('/facts/:id/feedback', async (req, res) => {
  try {
    const factId = req.params.id;
    const { agent_id, signal } = req.body; // signal = 'confirmed' or 'contradicted'

    if (!agent_id || !signal) return res.status(400).json({ error: 'Agent ID and Signal required' });

    const fact = await getFactById(factId);
    if (!fact) return res.status(404).json({ error: 'Fact not found' });

    // FIX: Double-settlement guard. Prevent repeated feedback exploitation.
    // Without this, an attacker could call /feedback 100 times to inflate reputation.
    if (fact.stake_status === 'released' || fact.stake_status === 'slashed') {
      return res.status(409).json({ 
        error: `Fact already settled with status: ${fact.stake_status}. Cannot re-settle.` 
      });
    }

    const agentTrust = await getAgentTrustScore(agent_id) || 0.5;
    const isTrue = signal === 'confirmed';

    // FIX: Retrieve REAL provisional signals from Stage 1 (no more mock data)
    const realSignals = await getCredibilitySignals(factId);
    if (!realSignals) {
      return res.status(500).json({ error: 'Provisional signals not found — Stage 1 data missing for this fact.' });
    }
    const provisionalSignals = {
      s_rep: parseFloat(realSignals.s_rep),
      s_stake: parseFloat(realSignals.s_stake),
      s_geo: parseFloat(realSignals.s_geo),
      s_temporal: parseFloat(realSignals.s_temporal),
      s_semantic: parseFloat(realSignals.s_semantic)
    };

    // Run STAGE 2 Math, injecting the fact's domain to pull the mathematically accurate structural priors
    // In demo mode, lower the reward threshold to accommodate cold-start (sparse data, no corroboration)
    // Production: 0.70 (requires multi-submitter corroboration). Demo: 0.42 (agent feedback is decisive)
    const rewardThreshold = process.env.DEMO_MODE === 'true' ? 0.42 : 0.70;
    const terminalResult = calculateTerminalScore(provisionalSignals, isTrue, agentTrust, fact.domain, rewardThreshold);

    console.log(`⚖️ [Settlement] Fact ${factId.substring(0,8)} | Terminal Score: ${(terminalResult.finalScore*100).toFixed(1)}%`);

    // EXECUTE THE GAME THEORY (Off-chain DB update + On-chain settlement)
    let settlementTxHash: string | null = null;
    if (terminalResult.terminal_status === 'REWARD') {
      await updateFactStatus(factId, 'released', terminalResult.finalScore);
      await updateSubmitterReputation(fact.submitter_id, 0.05);
      await updateAgentTrustScore(agent_id, isTrue ? 0.02 : -0.10);
      
      // On-chain: Release the USDC back to the human
      try {
        settlementTxHash = await releaseStakeOnChain(factId);
        await pool.query('UPDATE facts SET settlement_tx_hash = $1 WHERE id = $2', [settlementTxHash, factId]);
        console.log(`💰 [Game Theory] Human rewarded. Stake released on-chain. TX: ${settlementTxHash}`);
      } catch (err: any) {
        console.warn(`⚠️  [Blockchain] On-chain release failed (stake may not be on-chain): ${err.message}`);
        console.log(`💰 [Game Theory] Human rewarded. Stake released (off-chain only).`);
      }
    } else {
      await updateFactStatus(factId, 'slashed', terminalResult.finalScore);
      await updateSubmitterReputation(fact.submitter_id, -0.20);
      
      // On-chain: Slash the USDC (send to treasury)
      try {
        settlementTxHash = await slashStakeOnChain(factId);
        await pool.query('UPDATE facts SET settlement_tx_hash = $1 WHERE id = $2', [settlementTxHash, factId]);
        console.log(`🔥 [Game Theory] Stake SLASHED on-chain. TX: ${settlementTxHash}`);
      } catch (err: any) {
        console.warn(`⚠️  [Blockchain] On-chain slash failed: ${err.message}`);
        console.log(`🔥 [Game Theory] Consensus failed. Human stake BURNED (off-chain only).`);
      }
    }

    res.json({ success: true, settlement: terminalResult, settlement_tx_hash: settlementTxHash });

    // FIX: Record feedback in agent_feedback table for audit trail
    // (Non-blocking — don't let audit failure break settlement)
    pool.query(
      `INSERT INTO agent_feedback (fact_id, agent_id, agent_trust_score, signal) VALUES ($1, $2, $3, $4)`,
      [factId, agent_id, agentTrust, signal]
    ).catch(err => console.error('⚠️ [Audit] Failed to record agent feedback:', err.message));

  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
// 4. GET SIGNALS FOR A FACT (for frontend radar chart)
app.get('/facts/:id/signals', async (req, res) => {
  try {
    const signals = await getCredibilitySignals(req.params.id);
    if (!signals) return res.status(404).json({ error: 'No signals found for this fact.' });
    const fact = await getFactById(req.params.id);
    res.json({
      fact_id: req.params.id,
      credibility_score: fact?.credibility_score,
      status: fact?.stake_status,
      signals: {
        s_rep: parseFloat(signals.s_rep),
        s_stake: parseFloat(signals.s_stake),
        s_geo: parseFloat(signals.s_geo),
        s_temporal: parseFloat(signals.s_temporal),
        s_semantic: parseFloat(signals.s_semantic),
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4b. GET VERIFICATION DETAILS (full pipeline output for Verification Viewer)
app.get('/facts/:id/verification', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT verification_details FROM facts WHERE id = $1', [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Fact not found' });
    const details = rows[0].verification_details;
    if (!details) return res.json({ verification: null, message: 'No verification data stored for this fact' });
    res.json({ verification: details });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET SUBMITTER PROFILE
app.get('/submitters/:wallet', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM submitters WHERE wallet_address = $1', [req.params.wallet]);
    if (rows.length === 0) return res.status(404).json({ error: 'Submitter not found' });
    const submitter = rows[0];
    // Count their facts
    const factCount = await pool.query('SELECT COUNT(*) FROM facts WHERE submitter_id = $1', [submitter.id]);
    res.json({
      wallet_address: submitter.wallet_address,
      reputation_score: submitter.reputation_score,
      total_facts: parseInt(factCount.rows[0].count),
      created_at: submitter.created_at
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. GET RECENT ACTIVITY (for agent terminal feed)
app.get('/activity', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT f.id, f.text_claim, f.domain, f.credibility_score, f.stake_status, 
             f.stake_amount, f.submitted_at, f.consumed_count, f.stake_tx_hash, f.settlement_tx_hash,
             s.wallet_address, s.reputation_score
      FROM facts f
      JOIN submitters s ON f.submitter_id = s.id
      WHERE f.stake_status != 'pending'
      ORDER BY f.submitted_at DESC
      LIMIT 20
    `);
    res.json({ activity: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. BLOCKCHAIN STATUS
app.get('/blockchain/status', async (req, res) => {
  try {
    const status = await getBlockchainStatus();
    const totalLocked = await getTotalLocked();
    res.json({ ...status, totalLockedUsdc: totalLocked });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 8. GET USDC BALANCE FOR A WALLET
app.get('/blockchain/balance/:wallet', async (req, res) => {
  try {
    const balance = await getUsdcBalance(req.params.wallet);
    res.json({ wallet: req.params.wallet, usdc_balance: balance, network: 'base-sepolia' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. GET ON-CHAIN STAKE STATUS FOR A FACT
app.get('/blockchain/stake/:factId', async (req, res) => {
  try {
    const stake = await getStakeOnChain(req.params.factId);
    if (!stake) return res.json({ on_chain: false, message: 'Stake not found on-chain (may be off-chain only)' });
    res.json({ on_chain: true, ...stake });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// DEMO MODE: Reset endpoint (only available in demo mode)
// Resets submitter reputation and agent trust to specified values
// ─────────────────────────────────────────────
app.post('/demo/reset', async (req, res) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.status(403).json({ error: 'Demo reset only available in DEMO_MODE' });
  }
  try {
    const { wallet_address, reputation, agent_id, agent_trust } = req.body;
    let factsDeleted = 0;
    
    if (wallet_address) {
      // Reset reputation (don't delete facts — preserves phone-submitted data)
      if (reputation !== undefined) {
        await pool.query(
          'UPDATE submitters SET reputation_score = $1 WHERE wallet_address = $2',
          [reputation, wallet_address]
        );
      }
      console.log(`🎭 [Demo Reset] Submitter ${wallet_address.substring(0,10)}... → rep=${reputation}`);
    }
    
    if (agent_id && agent_trust !== undefined) {
      await pool.query(
        'INSERT INTO agents (id, trust_score) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET trust_score = $2',
        [agent_id, agent_trust]
      );
      console.log(`🎭 [Demo Reset] Agent ${agent_id} trust → ${agent_trust}`);
    }
    
    res.json({ success: true, reputation, agent_trust, facts_deleted: factsDeleted });
  } catch (err: any) {
    console.error('🎭 [Demo Reset] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────
// AGENTIC AI CONSUMER — SSE Simulation Endpoints
// ─────────────────────────────────────────────

// Helper to run the SSE stream for a given scenario
async function streamAgentSimulation(res: any, scenarioId: string) {
  const backendUrl = `http://localhost:${PORT}`;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  try {
    for await (const event of runAgentSimulation(backendUrl, scenarioId)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      console.log(`🤖 [Agent:${scenarioId}] ${event.step} → ${event.status}`);
    }
  } catch (err: any) {
    console.error('🤖 [Agent] Error:', err.message);
    res.write(`data: ${JSON.stringify({ step: 'Error', type: 'error', status: 'error', thinking: err.message, timestamp: new Date().toISOString() })}\n\n`);
  }
  res.write(`data: [DONE]\n\n`);
  res.end();
}

// Scenario-specific SSE endpoint
app.get('/agent/simulate/:scenarioId', async (req, res) => {
  const { scenarioId } = req.params;
  console.log(`🤖 [Agent] Starting scenario: ${scenarioId}`);
  
  // Auto-reset facts for this domain so the demo can run repeatedly
  try {
    const domain = scenarioId === 'logistics-traffic' ? 'logistics' : 'energy';
    const { rows } = await pool.query("SELECT id FROM facts WHERE domain = $1", [domain]);
    if (rows.length > 0) {
      const factIds = rows.map((r: any) => r.id);
      await pool.query("DELETE FROM agent_feedback WHERE fact_id = ANY($1)", [factIds]);
      await pool.query("UPDATE facts SET stake_status = 'locked' WHERE domain = $1", [domain]);
    }
  } catch (err) {
    console.error("Auto-reset failed:", err);
  }

  await streamAgentSimulation(res, scenarioId);
});

// Legacy endpoint (defaults to logistics-traffic)
app.get('/agent/simulate', async (req, res) => {
  await streamAgentSimulation(res, 'logistics-traffic');
});

// Return all available scenarios for the frontend selector
app.get('/agent/scenarios', (req, res) => {
  res.json({ scenarios: DEMO_SCENARIOS.map(s => ({
    id: s.id, agentName: s.agentName, agentRole: s.agentRole,
    agentColor: s.agentColor, agentEmoji: s.agentEmoji,
    domain: s.domain, missionBrief: s.missionBrief,
    businessContext: s.businessContext, expectedVerdict: s.expectedVerdict,
    streetViewLat: s.streetViewLat, streetViewLng: s.streetViewLng,
    streetViewLocation: s.streetViewLocation,
  }))});
});

// Agent persona (backward compat)
app.get('/agent/persona', (req, res) => {
  res.json({ persona: AGENT_PERSONA });
});

// Street View Static API proxy (avoids CORS issues from frontend)
app.get('/agent/streetview', async (req, res) => {
  const { lat, lng, size = '600x300', fov = '90', heading = '0', pitch = '0' } = req.query;
  if (!lat || !lng) return res.status(400).json({ error: 'lat and lng required' });

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY not configured' });

  const svUrl = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${lat},${lng}&fov=${fov}&heading=${heading}&pitch=${pitch}&key=${apiKey}`;

  try {
    const svRes = await fetch(svUrl);
    if (!svRes.ok) {
      return res.status(svRes.status).json({ error: 'Street View API error' });
    }
    const contentType = svRes.headers.get('content-type') || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = await svRes.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Aperture Protocol running on port ${PORT}`));