// backend/scripts/test-liar-loop.ts

const API_BASE_URL = 'http://localhost:3000'; // Update if your server runs on a different port

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runLiarLoop() {
  console.log("🚀 APERTURE E2E: INITIATING LIAR'S LOOP (UNHAPPY PATH)");
  console.log("==========================================================\n");

  try {
    // ==========================================================
    // STEP 1: Bad Actor Submits Fake Data
    // ==========================================================
    console.log("📍 STEP 1: Bad actor uploading fake intelligence...");
    
    const submitRes = await fetch(`${API_BASE_URL}/facts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text_claim: "FAKE INTEL: Crane 4 at Nhava Sheva has been stolen by aliens.",
        domain: "maritime-logistics",
        wallet_address: "0xBadActorWallet999", // Unique wallet to track the slashing
        stake_amount: "5.0",
        latitude: "18.949",
        longitude: "72.944"
      })
    });

    if (!submitRes.ok) throw new Error(`Submission failed: ${await submitRes.text()}`);
    
    const factData = await submitRes.json();
    const factId = factData.id;
    console.log(`✅ Success! Fact stored with ID: ${factId}`);
    console.log(`📊 Provisional Credibility: ${factData.credibility_score}%`);
    await sleep(1000);

    // ==========================================================
    // STEP 2: AI Agent Hits Paywall
    // ==========================================================
    console.log("\n🤖 STEP 2: AI Agent attempts to access the data (No Receipt)...");
    
    const accessRes = await fetch(`${API_BASE_URL}/facts/${factId}`);
    let dynamicPrice = 0;

    if (accessRes.status === 402) {
      const errorData = await accessRes.json();
      // Using the exact JSON path we fixed earlier!
      dynamicPrice = errorData.x402.accepts[0].amount; 
      console.log(`🛑 Paywall Hit! Engine quoted Dynamic Price: $${dynamicPrice} USDC`);
    } else {
      throw new Error('Paywall failed to trigger! Status: ' + accessRes.status);
    }
    await sleep(1000);

    // ==========================================================
    // STEP 3: AI Agent Pays and Unlocks Data
    // ==========================================================
    console.log("\n💸 STEP 3: AI Agent signs crypto transaction and retries...");
    
    // Simulate the Web3 L402 Authorization header
    const paidRes = await fetch(`${API_BASE_URL}/facts/${factId}`, {
      headers: {
        'Authorization': `L402 token="mock_macaroon", preimage="mock_payment_hash"`
      }
    });

    if (!paidRes.ok) throw new Error(`Failed to unlock data: ${await paidRes.text()}`);
    
    const unlockedData = await paidRes.json();
    console.log(`🔓 Success! Data unlocked: "${unlockedData.text_claim}"`);
    await sleep(1000);

    // ==========================================================
    // STEP 4: AI Agent Rejects the Fake Data (The Slashing)
    // ==========================================================
    console.log("\n⚖️ STEP 4: AI Agent uses data, detects FALSEHOOD, and submits REJECT feedback...");
    
    // NOTE: Make sure this endpoint matches your actual verification route!
    const verifyRes = await fetch(`${API_BASE_URL}/facts/${factId}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: "agent-verifier-001",
        status: "REJECT", // Triggering the unhappy path
        confidence_score: 0.98,
        reason: "Ground truth verification failed. Satellite imagery confirms Crane 4 is present and operational."
      })
    });

    if (!verifyRes.ok) throw new Error(`Verification failed: ${await verifyRes.text()}`);
    
    const finalResult = await verifyRes.json();
    
    console.log(`✅ Feedback Processed!`);
    console.log(`📉 Terminal Credibility Score: ${finalResult.new_credibility_score}%`);
    console.log(`🚨 Network Decision: ${finalResult.network_decision} (Stake burned, reputation penalized)`);

    console.log("\n==========================================================");
    console.log(" 🎉 LIAR'S LOOP TEST COMPLETE: Bad Actor Successfully Slashed!");
    console.log("==========================================================");

  } catch (error: any) {
    console.error("\n❌ TEST FAILED:", error.message);
    console.error(error.stack);
  }
}

runLiarLoop();