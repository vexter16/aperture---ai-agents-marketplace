import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  try {
    await client.connect();
    await client.query("ALTER TABLE facts ALTER COLUMN stake_status DROP DEFAULT;");
    await client.query("ALTER TABLE facts DROP CONSTRAINT IF EXISTS facts_stake_status_check;");
    await client.query("ALTER TABLE facts ADD CONSTRAINT facts_stake_status_check CHECK (stake_status IN ('pending', 'locked', 'released', 'frozen', 'slashed'));");
    await client.query("ALTER TABLE facts ALTER COLUMN stake_status SET DEFAULT 'pending';");
    console.log("Migration successful");
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}
migrate();
