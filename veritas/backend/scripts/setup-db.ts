import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {
  try {
    await client.connect();
    console.log('Connected to local PostgreSQL...');

    const schema = `
      -- 1. Enable pgvector extension
      CREATE EXTENSION IF NOT EXISTS vector;

      -- 2. Submitter identities and reputation
      CREATE TABLE IF NOT EXISTS submitters (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_address TEXT UNIQUE NOT NULL,
        reputation_score FLOAT DEFAULT 0.5,
        total_submissions INT DEFAULT 0,
        confirmed_count INT DEFAULT 0,
        contradicted_count INT DEFAULT 0,
        wallet_age_days INT DEFAULT 0,
        wallet_tx_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 3. Core facts table
      CREATE TABLE IF NOT EXISTS facts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        submitter_id UUID REFERENCES submitters(id),
        text_claim TEXT NOT NULL,
        domain TEXT NOT NULL, -- Constraint added dynamically below
        location_name TEXT,
        latitude FLOAT,
        longitude FLOAT,
        image_url TEXT,
        clip_score FLOAT,
        stake_amount FLOAT NOT NULL,
        stake_status TEXT DEFAULT 'locked' CHECK (stake_status IN ('locked', 'released', 'frozen', 'slashed')),
        credibility_score FLOAT,
        credibility_mode TEXT DEFAULT 'bootstrap' CHECK (credibility_mode IN ('bootstrap', 'full')),
        embedding vector(384),
        dispute_flag BOOLEAN DEFAULT FALSE,
        consumed_count INT DEFAULT 0,
        price_usdc FLOAT DEFAULT 0.05,
        exif_gps_lat FLOAT,
        exif_gps_lng FLOAT,
        exif_timestamp TIMESTAMPTZ,
        exif_has_data BOOLEAN DEFAULT FALSE,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        window_closes_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '4 hours'
      );

      -- FORCE CONSTRAINT UPDATE (Schema Migration)
      -- This ensures that if the table already existed with an old check constraint, it gets properly upgraded
      ALTER TABLE facts DROP CONSTRAINT IF EXISTS facts_domain_check;
      ALTER TABLE facts ADD CONSTRAINT facts_domain_check 
      CHECK (domain IN ('financial', 'logistics', 'agricultural', 'maritime-logistics', 'energy', 'infrastructure'));

      -- 4. Individual signal scores per fact (for radar chart)
      CREATE TABLE IF NOT EXISTS credibility_signals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fact_id UUID REFERENCES facts(id) ON DELETE CASCADE,
        s_rep FLOAT,
        s_stake FLOAT,
        s_geo FLOAT,
        s_temporal FLOAT,
        s_agent FLOAT,
        s_semantic FLOAT,
        w_rep FLOAT DEFAULT 0.167,
        w_stake FLOAT DEFAULT 0.167,
        w_geo FLOAT DEFAULT 0.167,
        w_temporal FLOAT DEFAULT 0.167,
        w_agent FLOAT DEFAULT 0.167,
        w_semantic FLOAT DEFAULT 0.167,
        computed_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 5. Agent feedback
      CREATE TABLE IF NOT EXISTS agent_feedback (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fact_id UUID REFERENCES facts(id),
        agent_id TEXT NOT NULL,
        agent_trust_score FLOAT DEFAULT 0.5,
        signal TEXT CHECK (signal IN ('confirmed', 'contradicted', 'unverifiable')) NOT NULL,
        confidence FLOAT,
        evidence TEXT,
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 6. x402 payment transactions
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fact_id UUID REFERENCES facts(id),
        agent_id TEXT NOT NULL,
        amount_usdc FLOAT NOT NULL,
        tx_hash TEXT,
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 6b. Agents table (moved from runtime code to setup script)
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        trust_score FLOAT DEFAULT 0.5,
        total_queries INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      -- 7. Bayesian signal weights (global, updated over time)
      CREATE TABLE IF NOT EXISTS signal_weights (
        id INT PRIMARY KEY DEFAULT 1,
        w_rep FLOAT DEFAULT 0.167,
        w_stake FLOAT DEFAULT 0.167,
        w_geo FLOAT DEFAULT 0.167,
        w_temporal FLOAT DEFAULT 0.167,
        w_agent FLOAT DEFAULT 0.167,
        w_semantic FLOAT DEFAULT 0.167,
        update_count INT DEFAULT 0,
        last_updated TIMESTAMPTZ DEFAULT NOW()
      );

      INSERT INTO signal_weights (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

      -- 8. Semantic Search Function
      CREATE OR REPLACE FUNCTION search_facts(
        query_embedding vector(384),
        match_threshold FLOAT DEFAULT 0.5,
        match_count INT DEFAULT 10
      )
      RETURNS TABLE (
        id UUID,
        text_claim TEXT,
        domain TEXT,
        location_name TEXT,
        latitude FLOAT,
        longitude FLOAT,
        credibility_score FLOAT,
        price_usdc FLOAT,
        submitted_at TIMESTAMPTZ,
        similarity FLOAT
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        SELECT
          f.id,
          f.text_claim,
          f.domain,
          f.location_name,
          f.latitude,
          f.longitude,
          f.credibility_score,
          f.price_usdc,
          f.submitted_at,
          1 - (f.embedding <=> query_embedding) AS similarity
        FROM facts f
        WHERE 
          f.stake_status NOT IN ('slashed')
          AND 1 - (f.embedding <=> query_embedding) > match_threshold
        ORDER BY similarity DESC
        LIMIT match_count;
      END;
      $$;
    `;

    await client.query(schema);

    // ─────────────────────────────────────────────
    // BLOCKCHAIN SCHEMA MIGRATION
    // Adds on-chain transaction tracking columns to the facts table.
    // Uses IF NOT EXISTS so it's safe to run multiple times.
    // ─────────────────────────────────────────────
    const blockchainMigration = `
      ALTER TABLE facts ADD COLUMN IF NOT EXISTS stake_tx_hash TEXT;
      ALTER TABLE facts ADD COLUMN IF NOT EXISTS settlement_tx_hash TEXT;
      ALTER TABLE facts ADD COLUMN IF NOT EXISTS chain_id INTEGER DEFAULT 84532;
      ALTER TABLE facts ADD COLUMN IF NOT EXISTS staker_address TEXT;
    `;
    await client.query(blockchainMigration);
    console.log('✅ Database schema created successfully with pgvector + blockchain columns!');

  } catch (error) {
    console.error('❌ Error setting up database:', error);
  } finally {
    await client.end();
  }
}

setupDatabase(); 