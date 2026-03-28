import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

import { insertFact, getFactById, semanticSearch, getAllFacts, upsertSubmitter } from './db/index';
import { embedText } from './services/embeddings';

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// THE x402 PROTOCOL MIDDLEWARE (Built from scratch)
// ─────────────────────────────────────────────
async function x402Paywall(req: any, res: any, next: any) {
  const factId = req.params.id;
  const paymentReceipt = req.headers['x-payment-receipt'];

  // 1. If no receipt is provided, hit them with the 402 Paywall
  if (!paymentReceipt) {
    const fact = await getFactById(factId);
    if (!fact) return res.status(404).json({ error: 'Fact not found' });

    console.log(`🛑 [x402] Blocked un-paid access to fact: ${factId}`);
    
    return res.status(402).json({
      error: 'Payment Required',
      x402: {
        version: '1.0',
        accepts: [{
          network: 'arc-testnet',
          asset: 'USDC',
          amount: fact.price_usdc,
          payTo: process.env.CIRCLE_WALLET_ADDRESS || '0xYourProtocolWallet',
          description: `Unlock Veritas Intelligence: ${fact.id}`
        }]
      }
    });
  }

  // 2. If receipt is provided, verify it
  console.log(`💸 [x402] Verifying payment receipt: ${paymentReceipt}`);
  
  if (process.env.DEMO_MODE === 'true') {
    // In DEMO_MODE, we accept the mock receipt instantly
    req.payment_verified = true;
    return next();
  }

  // (Production: Here you would check the Arc Testnet blockchain for the txHash)
  return res.status(402).json({ error: 'Invalid or unconfirmed payment receipt' });
}

// ─────────────────────────────────────────────
// PUBLIC API ROUTES
// ─────────────────────────────────────────────

// 1. Get all facts (Free)
app.get('/facts', async (req, res) => {
  try {
    const facts = await getAllFacts();
    res.json({ facts });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Semantic Search (Free - used by Agents to find what they want)
app.get('/facts/search', async (req, res) => {
  try {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

    const queryEmbedding = await embedText(q);
    const results = await semanticSearch(queryEmbedding, 0.2, 5); // 0.2 is the similarity threshold
    
    res.json({ results, count: results.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Submit a new fact (Free - done by Humans)
app.post('/facts', async (req, res) => {
  try {
    const { text_claim, domain, wallet_address } = req.body;
    if (!text_claim || !domain || !wallet_address) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const submitter = await upsertSubmitter(wallet_address);
    const embedding = await embedText(text_claim);

    const newFact = await insertFact({
      submitter_id: submitter.id,
      text_claim,
      domain,
      stake_amount: 2.00, // Hardcoded $2 stake for now
      price_usdc: 0.05,   // Hardcoded $0.05 price
      embedding
    });

    console.log(`✅ [API] New fact submitted and vectorized: ${newFact.id}`);
    res.status(201).json({ id: newFact.id, message: 'Fact staked and indexed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Get Full Fact Details (PAID - Protected by x402)
app.get('/facts/:id', x402Paywall, async (req: any, res) => {
  try {
    const fact = await getFactById(req.params.id);
    console.log(`🔓 [API] Unlocked fact for agent: ${fact.id}`);
    
    res.json({
      success: true,
      fact: {
        id: fact.id,
        text_claim: fact.text_claim,
        domain: fact.domain,
        verified_at: fact.submitted_at
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Veritas Protocol running on port ${PORT}`));