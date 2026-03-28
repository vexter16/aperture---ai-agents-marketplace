import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Helper: pgvector expects arrays as string format '[0.1, 0.2, ...]'
const toSqlVector = (arr: number[]) => `[${arr.join(',')}]`;

export async function upsertSubmitter(walletAddress: string) {
  const query = `
    INSERT INTO submitters (wallet_address) VALUES ($1)
    ON CONFLICT (wallet_address) DO UPDATE SET wallet_address = EXCLUDED.wallet_address
    RETURNING *;
  `;
  const { rows } = await pool.query(query, [walletAddress]);
  return rows[0];
}

export async function insertFact(fact: any) {
  const query = `
    INSERT INTO facts 
    (submitter_id, text_claim, domain, location_name, latitude, longitude, stake_amount, embedding, price_usdc)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING *;
  `;
  
  const values = [
    fact.submitter_id, fact.text_claim, fact.domain, fact.location_name || null,
    fact.latitude || null, fact.longitude || null, fact.stake_amount, 
    fact.embedding ? toSqlVector(fact.embedding) : null, fact.price_usdc || 0.05
  ];

  const { rows } = await pool.query(query, values);
  return rows[0];
}

export async function semanticSearch(queryEmbedding: number[], threshold: number = 0.4, limit: number = 10) {
  const query = `SELECT * FROM search_facts($1::vector, $2, $3);`;
  const values = [toSqlVector(queryEmbedding), threshold, limit];
  
  const { rows } = await pool.query(query, values);
  return rows;
}
export async function getFactById(id: string) {
  const { rows } = await pool.query(`SELECT * FROM facts WHERE id = $1`, [id]);
  return rows[0];
}

export async function getAllFacts() {
  const { rows } = await pool.query(`
    SELECT id, text_claim, domain, price_usdc, credibility_score 
    FROM facts 
    ORDER BY submitted_at DESC LIMIT 50
  `);
  return rows;
}