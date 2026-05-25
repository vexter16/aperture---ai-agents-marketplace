import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper: pgvector expects arrays as string format '[0.1, 0.2, ...]'
const toSqlVector = (arr: number[]) => `[${arr.join(',')}]`;

// Helper: parse pgvector string '[0.1,0.2,...]' back to number[]
export function parsePgVector(vectorStr: string | null): number[] {
  if (!vectorStr) return [];
  if (Array.isArray(vectorStr)) return vectorStr; // Already parsed
  try {
    return vectorStr.replace('[', '[').replace(']', ']')
      .slice(1, -1).split(',').map(Number);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// VALIDATION HELPERS
// ─────────────────────────────────────────────

// FIX: Validate Ethereum-style wallet addresses (0x + 40 hex chars)
export function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

// ─────────────────────────────────────────────
// ORIGINAL FUNCTIONS (Core CRUD)
// ─────────────────────────────────────────────

export async function upsertSubmitter(walletAddress: string) {
  // FIX: Validate wallet format to prevent garbage data in submitters table
  if (!isValidWalletAddress(walletAddress)) {
    throw new Error(`Invalid wallet address format: ${walletAddress}. Expected 0x + 40 hex characters.`);
  }

  // FIX: Use 0.5 (neutral) as default — matches Bayesian prior. Schema default was 0.3 (inconsistent).
  const query = `
    INSERT INTO submitters (wallet_address, reputation_score) VALUES ($1, 0.5)
    ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [walletAddress]);
  return rows[0];
}

export async function insertFact(fact: any) {
  const query = `
    INSERT INTO facts 
    (submitter_id, text_claim, domain, location_name, latitude, longitude, stake_amount, embedding, price_usdc, credibility_score, staker_address)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING *;
  `;
  
  // FIX: Use ?? instead of || to prevent valid 0 values from being nullified
  // Old code: latitude 0.0 (Gulf of Guinea) → null, credibility_score 0.0 → null
  const values = [
    fact.submitter_id, fact.text_claim, fact.domain, fact.location_name ?? null,
    fact.latitude ?? null, fact.longitude ?? null, fact.stake_amount, 
    fact.embedding ? toSqlVector(fact.embedding) : null, fact.price_usdc ?? 0.05,
    fact.credibility_score ?? null, fact.staker_address ?? null
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
}

// FIX: Returns full fact data + submitter reputation for credibility engine
// Old version used search_facts() which omitted embedding, stake, reputation, timestamp
export async function semanticSearch(queryEmbedding: number[], threshold: number = 0.4, limit: number = 10) {
  const query = `
    SELECT 
      f.id, f.text_claim, f.domain, f.location_name,
      f.latitude, f.longitude, f.credibility_score, f.price_usdc,
      f.stake_amount, f.embedding, f.submitted_at,
      s.reputation_score,
      1 - (f.embedding <=> $1::vector) AS similarity
    FROM facts f
    JOIN submitters s ON f.submitter_id = s.id
    WHERE 
      f.stake_status NOT IN ('slashed', 'pending')
      AND 1 - (f.embedding <=> $1::vector) > $2
    ORDER BY similarity DESC
    LIMIT $3;
  `;
  const values = [toSqlVector(queryEmbedding), threshold, limit];
  const { rows } = await pool.query(query, values);
  return rows;
}

export async function getFactById(id: string) {
  const { rows } = await pool.query(`SELECT * FROM facts WHERE id = $1`, [id]);
  return rows[0];
}

export async function getAllFacts(walletAddress?: string) {
  let query = `
    SELECT id, text_claim, domain, price_usdc, credibility_score, latitude, longitude 
    FROM facts 
    WHERE stake_status NOT IN ('pending')
  `;
  const values: any[] = [];
  
  if (walletAddress) {
    query += ` AND staker_address = $1 `;
    values.push(walletAddress);
  }
  
  query += ` ORDER BY submitted_at DESC LIMIT 50`;
  
  const { rows } = await pool.query(query, values);
  return rows;
}

// ─────────────────────────────────────────────
// NEW FUNCTIONS: MLOPS & GAME THEORY
// ─────────────────────────────────────────────

// 1. Get or create agent trust score
// FIX: Removed CREATE TABLE IF NOT EXISTS — was running DDL on EVERY request.
// Table creation moved to setup-db.ts where it belongs.
export async function getAgentTrustScore(agentId: string): Promise<number> {
  const query = `
    INSERT INTO agents (id, trust_score) VALUES ($1, 0.5)
    ON CONFLICT (id) DO UPDATE SET total_queries = agents.total_queries + 1
    RETURNING trust_score;
  `;
  const { rows } = await pool.query(query, [agentId]);
  return rows[0].trust_score;
}

// 2. Finalize the Fact (Slash or Reward)
export async function updateFactStatus(factId: string, status: 'released' | 'slashed', finalScore: number) {
  const query = `
    UPDATE facts 
    SET stake_status = $2, credibility_score = $3 
    WHERE id = $1 
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [factId, status, finalScore]);
  return rows[0];
}

// 3. Update Human Reputation (Bounded between 0.0 and 1.0)
export async function updateSubmitterReputation(submitterId: string, delta: number) {
  const query = `
    UPDATE submitters 
    SET reputation_score = GREATEST(0.0, LEAST(1.0, reputation_score + $2))
    WHERE id = $1
    RETURNING reputation_score;
  `;
  const { rows } = await pool.query(query, [submitterId, delta]);
  return rows[0];
}

// 4. Update Agent Trust Score (Bounded between 0.1 and 1.0 so pricing math doesn't break)
export async function updateAgentTrustScore(agentId: string, delta: number) {
  const query = `
    UPDATE agents 
    SET trust_score = GREATEST(0.1, LEAST(1.0, trust_score + $2))
    WHERE id = $1
    RETURNING trust_score;
  `;
  const { rows } = await pool.query(query, [agentId, delta]);
  return rows[0];
}

// ─────────────────────────────────────────────
// CREDIBILITY SIGNAL PERSISTENCE (Connects Stage 1 → Stage 2)
// ─────────────────────────────────────────────

// 5. Save provisional signals after Stage 1 computation
export async function insertCredibilitySignals(factId: string, signals: { s_rep: number, s_stake: number, s_geo: number, s_temporal: number, s_semantic: number }) {
  const query = `
    INSERT INTO credibility_signals (fact_id, s_rep, s_stake, s_geo, s_temporal, s_semantic)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [factId, signals.s_rep, signals.s_stake, signals.s_geo, signals.s_temporal, signals.s_semantic]);
  return rows[0];
}

// 6. Retrieve real provisional signals for Stage 2 terminal settlement
export async function getCredibilitySignals(factId: string) {
  const query = `SELECT s_rep, s_stake, s_geo, s_temporal, s_semantic FROM credibility_signals WHERE fact_id = $1 ORDER BY computed_at DESC LIMIT 1;`;
  const { rows } = await pool.query(query, [factId]);
  return rows[0] || null;
}