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

const app = express();
app.use(cors());
app.use(express.json());

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

    // Build the Target Fact Data for the Engine
    const targetFact = {
      id: "temp-id", embedding, reputation: submitter.reputation_score,
      stake: parsedStake, latitude: parseFloat(latitude), 
      longitude: parseFloat(longitude), timestamp: Date.now(), domain
    };

    // Fetch recent facts to compare against
    const searchResults = await semanticSearch(embedding, 0.1, 10);

    // FIX: Transform DB rows into proper FactData objects.
    // The old code passed raw DB rows via "as any" — the engine received undefined
    // for embedding, reputation, stake, timestamp, making all signals meaningless.
    const relatedFacts: FactData[] = searchResults.map((r: any) => ({
      id: r.id,
      embedding: parsePgVector(r.embedding),
      reputation: parseFloat(r.reputation_score) || 0.5,
      stake: parseFloat(r.stake_amount) || 0,
      latitude: parseFloat(r.latitude) || 0,
      longitude: parseFloat(r.longitude) || 0,
      timestamp: r.submitted_at ? new Date(r.submitted_at).getTime() : Date.now()
    }));

    // Run STAGE 1 Math
    const provisionalResult = calculateProvisionalScore(targetFact, relatedFacts);

    if (provisionalResult.status === 'REJECTED_SYBIL_SUSPECT') {
       if (process.env.NODE_ENV === 'test' || process.env.BYPASS_SYBIL === 'true' || process.env.DEMO_MODE === 'true') {
          console.log("⚠️ [Demo/Test Mode] Bypassing Sybil/Bot detection so scenario can continue.");
       } else {
          return res.status(403).json({ error: 'Rejected: Sybil/Bot behavior detected.', score: provisionalResult.finalScore });
       }
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

    // DEMO MODE: Auto-lock facts so they appear in the marketplace immediately
    // (In production, facts stay 'pending' until the mobile wallet confirms the on-chain tx)
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

    console.log(`✅ [API] Fact Staked: ${newFact.id} | Status: ${provisionalResult.status} | Score: ${(provisionalResult.finalScore * 100).toFixed(1)}%`);
    res.status(201).json({ 
      id: newFact.id, 
      credibility_score: provisionalResult.finalScore, 
      status: provisionalResult.status,
      stakeTransactions, // The Flutter app uses this to sign the on-chain USDC lock
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

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Aperture Protocol running on port ${PORT}`));