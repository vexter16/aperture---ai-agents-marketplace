// This simulates an Autonomous Logistics Agent
// It runs continuously, looking for valuable data on your network

const API_URL = 'http://localhost:3001';
const QUERY = 'emergency blaze'; // The query we used in our test earlier

async function runScoutLoop() {
  console.log(`\n🔍 [Scout Agent] Waking up. Searching network for: "${QUERY}"...`);

  try {
    // 1. Search the network
    const searchRes = await fetch(`${API_URL}/facts/search?q=${encodeURIComponent(QUERY)}`);
    const searchData = await searchRes.json() as any; // <-- Fixed TS Error

    if (!searchData.results || searchData.results.length === 0) {
      console.log(`💤 [Scout Agent] No relevant data found. Going back to sleep.`);
      return;
    }

    const topFact = searchData.results[0];
    console.log(`📊 [Scout Agent] Found highly relevant fact (${(topFact.similarity * 100).toFixed(1)}% match).`);
    console.log(`💰 [Scout Agent] Price is $${topFact.price_usdc}. Deciding to purchase...`);

    // 2. Try to consume the fact (Hits the 402 Paywall)
    let factRes = await fetch(`${API_URL}/facts/${topFact.id}`);
    
    if (factRes.status === 402) {
      console.log(`🛑 [Scout Agent] Hit x402 Paywall. Signing transaction from agent wallet...`);
      
      // 3. Autonomously Pay and Retry
      factRes = await fetch(`${API_URL}/facts/${topFact.id}`, {
        headers: { 'x-payment-receipt': 'agent-signed-tx-' + Date.now() }
      });
    }

    const factData = await factRes.json() as any; // <-- Fixed TS Error
    console.log(`\n✅ [Scout Agent] PURCHASE SUCCESSFUL!`);
    console.log(`📦 [Scout Agent] Intelligence Acquired: "${factData.fact.text_claim}"`);
    console.log(`🔄 [Scout Agent] Re-routing supply chain based on new intelligence...\n`);

  } catch (error) {
    console.error('❌ Agent Error:', error);
  }
}

// Run the agent
runScoutLoop();