import dotenv from 'dotenv';
dotenv.config();

import { pool, upsertSubmitter } from '../db/index';
import { embedText } from '../services/embeddings';
import { randomUUID } from 'crypto';

const MOCK_SUBMITTERS = [
  '0x1111111111111111111111111111111111111111',
  '0x2222222222222222222222222222222222222222',
  '0x3333333333333333333333333333333333333333',
];

const FACTS = [
  // LOGISTICS (Target for the LogiScan AI)
  {
    claim: 'bangalore city townhall traffic',
    domain: 'logistics',
    location: 'Town Hall, Bengaluru',
    lat: 12.9581, lng: 77.5833,
    stake: 5.00,
    price: 0.05,
    score: 0.95,
    status: 'locked'
  },
  {
    claim: 'Truck breakdown causing 2km bottleneck at Silk Board Junction',
    domain: 'logistics',
    location: 'Silk Board, Bengaluru',
    lat: 12.9177, lng: 77.6238,
    stake: 1.50,
    price: 0.02,
    score: 0.52,
    status: 'locked'
  },
  {
    claim: 'New toll gate operational at Nelamangala highway causing 15 min delays for commercial vehicles',
    domain: 'logistics',
    location: 'Nelamangala',
    lat: 13.1000, lng: 77.3948,
    stake: 5.00,
    price: 0.10,
    score: 0.52,
    status: 'locked'
  },
  {
    claim: 'Whitefield road cleared, traffic moving smoothly after morning accident',
    domain: 'logistics',
    location: 'Whitefield',
    lat: 12.9698, lng: 77.7499,
    stake: 0.50,
    price: 0.01,
    score: 0.45,
    status: 'locked'
  },

  // INFRASTRUCTURE
  {
    claim: 'Yellow Line Metro construction pillar completed at Jayadeva Junction',
    domain: 'infrastructure',
    location: 'Jayadeva, Bengaluru',
    lat: 12.9184, lng: 77.5950,
    stake: 3.50,
    price: 0.08,
    score: 0.75,
    status: 'locked'
  },
  {
    claim: 'Pothole repairs initiated on Indiranagar 100ft road',
    domain: 'infrastructure',
    location: 'Indiranagar',
    lat: 12.9784, lng: 77.6408,
    stake: 1.00,
    price: 0.03,
    score: 0.60,
    status: 'locked'
  },
  {
    claim: 'Massive earthquake measuring 7.2 on Richter scale hits central district causing building collapses',
    domain: 'infrastructure',
    location: 'Central Bengaluru',
    lat: 12.9716, lng: 77.5946,
    stake: 0.50, // Low stake for a wild claim
    price: 0.01,
    score: 0.15, // Extremely low credibility
    status: 'locked'
  },

  // ENERGY / POWER
  {
    claim: 'Unscheduled power cut affecting entire Koramangala 4th Block area for past 2 hours',
    domain: 'energy',
    location: 'Koramangala',
    lat: 12.9345, lng: 77.6266,
    stake: 2.00,
    price: 0.04,
    score: 0.68,
    status: 'locked'
  },
  {
    claim: 'transformer infront of bbmp office burnt in chandralayout bangalore',
    domain: 'energy',
    location: 'Chandra Layout, Bengaluru',
    lat: 12.9616, lng: 77.5255,
    stake: 4.00,
    price: 0.15,
    score: 0.98,
    status: 'locked'
  },

  // FINANCIAL / COMMERCIAL
  {
    claim: 'New massive retail mall soft-launched in Yelahanka today with heavy footfall',
    domain: 'financial',
    location: 'Yelahanka',
    lat: 13.1007, lng: 77.5963,
    stake: 1.50,
    price: 0.05,
    score: 0.55,
    status: 'locked'
  },
  {
    claim: 'Three major ATM kiosks out of cash near MG Road metro station',
    domain: 'financial',
    location: 'MG Road',
    lat: 12.9755, lng: 77.6068,
    stake: 0.80,
    price: 0.02,
    score: 0.48,
    status: 'locked'
  },

  // MISCELLANEOUS / NOISE
  {
    claim: 'Large public gathering forming at Freedom Park for planned protests',
    domain: 'infrastructure',
    location: 'Freedom Park',
    lat: 12.9768, lng: 77.5815,
    stake: 2.50,
    price: 0.05,
    score: 0.70,
    status: 'locked'
  },
  {
    claim: 'Random unverified event somewhere in the city maybe',
    domain: 'infrastructure',
    location: 'Unknown',
    lat: 12.9716, lng: 77.5946,
    stake: 0.01, // Spam
    price: 0.01,
    score: 0.05,
    status: 'locked'
  }
];

async function seed() {
  console.log('🌱 Starting database seed...');

  // Clean up previous seeded facts (identified by mock submitter wallets)
  for (const wallet of MOCK_SUBMITTERS) {
    const { rows } = await pool.query('SELECT id FROM submitters WHERE wallet_address = $1', [wallet]);
    if (rows.length > 0) {
      await pool.query('DELETE FROM credibility_signals WHERE fact_id IN (SELECT id FROM facts WHERE submitter_id = $1)', [rows[0].id]);
      await pool.query('DELETE FROM agent_feedback WHERE fact_id IN (SELECT id FROM facts WHERE submitter_id = $1)', [rows[0].id]).catch(() => {});
      await pool.query('DELETE FROM facts WHERE submitter_id = $1', [rows[0].id]);
      console.log(`🗑️  Cleaned old facts for submitter ${wallet.substring(0, 10)}...`);
    }
  }

  // 1. Ensure mock submitters exist with decent reputation
  for (const wallet of MOCK_SUBMITTERS) {
    await upsertSubmitter(wallet);
    await pool.query('UPDATE submitters SET reputation_score = 0.70 WHERE wallet_address = $1', [wallet]);
  }
  console.log(`✅ Upserted ${MOCK_SUBMITTERS.length} mock submitters (rep=0.70).`);

  // 2. Insert facts + credibility signals
  let count = 0;
  for (const fact of FACTS) {
    const submitterWallet = MOCK_SUBMITTERS[Math.floor(Math.random() * MOCK_SUBMITTERS.length)];
    
    const { rows } = await pool.query('SELECT id FROM submitters WHERE wallet_address = $1', [submitterWallet]);
    const submitterId = rows[0].id;

    console.log(`Generating embedding for: "${fact.claim.substring(0, 40)}..."`);
    const embedding = await embedText(fact.claim);

    const factId = randomUUID();
    await pool.query(`
      INSERT INTO facts 
      (id, submitter_id, text_claim, domain, location_name, latitude, longitude, stake_amount, price_usdc, credibility_score, stake_status, embedding, staker_address)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::vector, $13)
    `, [
      factId, submitterId, fact.claim, fact.domain, fact.location,
      fact.lat, fact.lng, fact.stake, fact.price, fact.score,
      fact.status, `[${embedding.join(',')}]`, submitterWallet
    ]);

    // Generate realistic credibility signals derived from the overall score
    // so that the Stage 2 terminal settlement engine has data to work with
    const baseScore = fact.score;
    const s_rep = Math.min(1, Math.max(0, 0.70));         // submitter rep
    const s_stake = Math.min(1, Math.max(0, baseScore * 0.8 + Math.random() * 0.2));
    const s_geo = Math.min(1, Math.max(0, 0.85 + Math.random() * 0.1));
    const s_temporal = Math.min(1, Math.max(0, 0.80 + Math.random() * 0.15));
    const s_semantic = Math.min(1, Math.max(0, baseScore > 0.4 ? 0.9 + Math.random() * 0.1 : 0.3 + Math.random() * 0.2));

    await pool.query(`
      INSERT INTO credibility_signals (fact_id, s_rep, s_stake, s_geo, s_temporal, s_semantic)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [factId, s_rep, s_stake, s_geo, s_temporal, s_semantic]);

    count++;
  }

  console.log(`\n✅ Successfully seeded ${count} facts + credibility signals across diverse domains!`);
  console.log('Agent demo scenarios are now ready to run.');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
