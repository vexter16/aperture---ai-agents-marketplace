// ─────────────────────────────────────────────────────────────────
// APERTURE PROTOCOL: END-TO-END INTEGRATION TEST
// Run this while `npm run dev` (your server.ts) is running in another terminal.
// ─────────────────────────────────────────────────────────────────

const API_URL = 'http://localhost:3001';

// Helper to generate a random mock wallet address
const generateWallet = () => '0x' + Array.from({length: 40}, () => Math.floor(Math.random() * 16).toString(16)).join('');

async function runFullLoop() {
  console.log('==========================================================');
  console.log(' 🚀 APERTURE E2E: INITIATING FULL LIFECYCLE TEST');
  console.log('==========================================================\n');

  const humanWallet = generateWallet();
  const agentId = `scout_agent_${Math.floor(Math.random() * 1000)}`;
  let factId = '';

  try {
    // ─────────────────────────────────────────────────────────
    // STEP 1: HUMAN SUBMITS FACT (Time = 0)
    // ─────────────────────────────────────────────────────────
    console.log('📍 STEP 1: Human field worker uploading intelligence...');
    
    // We use native FormData and Blob to simulate a Flutter multipart/form-data upload
    const formData = new FormData();
    formData.append('wallet_address', humanWallet);
    formData.append('text_claim', 'Crane 4 at Nhava Sheva is completely down. Massive backlog.');
    formData.append('domain', 'logistics');
    formData.append('stake_amount', '2.00');
    formData.append('latitude', '18.9442');
    formData.append('longitude', '72.9490');
    
    // Mock the image file
    const imageBlob = new Blob(['mock_image_binary_data'], { type: 'image/jpeg' });
    formData.append('image', imageBlob, 'evidence.jpg');

    const submitRes = await fetch(`${API_URL}/facts`, {
      method: 'POST',
      body: formData
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok) throw new Error(`Submission failed: ${JSON.stringify(submitData)}`);
    
    factId = submitData.id;
    console.log(`✅ Success! Fact stored with ID: ${factId.substring(0,8)}...`);
    console.log(`📊 Provisional Credibility: ${(submitData.credibility_score * 100).toFixed(1)}%\n`);


    // ─────────────────────────────────────────────────────────
    // STEP 2: AGENT HITS THE PAYWALL (Dynamic Pricing)
    // ─────────────────────────────────────────────────────────
    console.log('🤖 STEP 2: AI Agent attempts to access the data (No Receipt)...');
    
    let accessRes = await fetch(`${API_URL}/facts/${factId}`, {
      headers: { 'x-agent-id': agentId }
    });

    if (accessRes.status === 402) {
      const errorData = await accessRes.json();
      const quotedPrice = errorData.x402.accepts[0].amount;
      console.log(`🛑 Paywall Hit! Engine quoted Dynamic Price: $${quotedPrice} USDC`);
    } else {
      throw new Error('Paywall failed to trigger!');
    }


    // ─────────────────────────────────────────────────────────
    // STEP 3: AGENT PAYS AND UNLOCKS DATA
    // ─────────────────────────────────────────────────────────
    console.log('\n💸 STEP 3: AI Agent signs crypto transaction and retries...');
    
    accessRes = await fetch(`${API_URL}/facts/${factId}`, {
      headers: { 
        'x-agent-id': agentId,
        'x-payment-receipt': `tx_hash_${Date.now()}` // Mock receipt
      }
    });

    const factData = await accessRes.json();
    if (!accessRes.ok) throw new Error('Failed to unlock fact after payment');
    
    console.log(`🔓 Success! Data unlocked: "${factData.fact.text_claim}"\n`);


    // ─────────────────────────────────────────────────────────
    // STEP 4: TERMINAL SETTLEMENT (The MLOps Loop)
    // ─────────────────────────────────────────────────────────
    console.log('⚖️ STEP 4: AI Agent uses data and submits ground-truth feedback...');
    
    const feedbackRes = await fetch(`${API_URL}/facts/${factId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: agentId,
        signal: 'confirmed' // Agent confirms the human was telling the truth
      })
    });

    const feedbackData = await feedbackRes.json();
    if (!feedbackRes.ok) throw new Error('Terminal settlement failed');

    const finalScore = feedbackData.settlement.finalScore;
    const finalStatus = feedbackData.settlement.terminal_status;

    console.log(`✅ Feedback Processed!`);
    console.log(`📈 Terminal Credibility Score: ${(finalScore * 100).toFixed(1)}%`);
    console.log(`🏆 Network Decision: ${finalStatus} (Human stake released, reputation increased)`);

    console.log('\n==========================================================');
    console.log(' 🎉 E2E TEST COMPLETE: Zero Errors Detected!');
    console.log('==========================================================\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
  }
}

// Execute the test
runFullLoop();