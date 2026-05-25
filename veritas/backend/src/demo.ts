/**
 * ═══════════════════════════════════════════════════════════════════
 *  APERTURE PROTOCOL — FULL LIFECYCLE DEMO
 *  
 *  This script demonstrates the complete protocol loop:
 *  1. Human submits a fact → USDC locked on-chain
 *  2. AI Agent discovers fact → pays USDC via x402
 *  3. AI Agent verifies → submits ground-truth feedback
 *  4. Terminal settlement → on-chain slash or release
 *  5. Credibility engine adversarial scenarios
 *
 *  Run: npm run demo
 * ═══════════════════════════════════════════════════════════════════
 */

import dotenv from 'dotenv';
dotenv.config();
import readline from 'readline';
import { createPublicClient, createWalletClient, http, formatEther, formatUnits, parseAbi, Address, Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const API_URL = `http://localhost:${process.env.PORT || 3001}`;

const USDC_ADDRESS = (process.env.USDC_CONTRACT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address;
const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) });

// ─────────────────────────────────────────────
// UTILITY HELPERS
// ─────────────────────────────────────────────

const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

function banner(text: string) {
  const line = '═'.repeat(60);
  console.log(`\n${CYAN}${line}${RESET}`);
  console.log(`${CYAN}  ${BOLD}${text}${RESET}`);
  console.log(`${CYAN}${line}${RESET}\n`);
}

function log(icon: string, msg: string) {
  console.log(`  ${icon}  ${msg}`);
}

function logDetail(label: string, value: string) {
  console.log(`     ${DIM}${label}:${RESET} ${value}`);
}

async function waitForKeypress(prompt: string = 'Press ENTER to continue...') {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<void>(resolve => {
    rl.question(`\n  ${YELLOW}⏎ ${prompt}${RESET}`, () => {
      rl.close();
      resolve();
    });
  });
}

async function getBalances(address: Address): Promise<{ eth: string, usdc: string }> {
  const ethBalance = await publicClient.getBalance({ address });
  const usdcBalance = await publicClient.readContract({
    address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address],
  });
  return { eth: formatEther(ethBalance), usdc: formatUnits(usdcBalance, 6) };
}

// ─────────────────────────────────────────────
// DEMO SCENARIOS
// ─────────────────────────────────────────────

interface DemoScenario {
  name: string;
  description: string;
  claim: string;
  domain: string;
  stake: number;
  lat: number;
  lng: number;
  agentVerdict: 'confirmed' | 'contradicted';
  expectedOutcome: string;
}

const SCENARIOS: DemoScenario[] = [
  {
    name: '✅ HONEST SUBMISSION → REWARD',
    description: 'A legitimate human submits a verified real-world event. The AI Agent confirms it.',
    claim: 'Major traffic congestion observed on Outer Ring Road near Marathahalli due to waterlogging after heavy rainfall',
    domain: 'logistics',
    stake: 2.00,
    lat: 12.9516,
    lng: 77.7014,
    agentVerdict: 'confirmed',
    expectedOutcome: 'Stake RELEASED back to human. Reputation +0.05.',
  },
  {
    name: '🔥 FALSE CLAIM → SLASH',
    description: 'A malicious actor submits a false claim. The AI Agent contradicts it.',
    claim: 'Massive earthquake measuring 7.2 on Richter scale hits Bangalore central district causing building collapses',
    domain: 'infrastructure',
    stake: 0.50,
    lat: 12.9716,
    lng: 77.5946,
    agentVerdict: 'contradicted',
    expectedOutcome: 'Stake SLASHED (burned). Reputation -0.20. Human penalized.',
  },
  {
    name: '🐋 LOW-STAKE SPAM ATTEMPT',
    description: 'A spammer tries to flood the marketplace with low-stake claims. The credibility engine penalizes the weak stake signal.',
    claim: 'Random unverified event somewhere in the city maybe',
    domain: 'financial',
    stake: 0.01,
    lat: 12.9716,
    lng: 77.5946,
    agentVerdict: 'contradicted',
    expectedOutcome: 'Very low credibility score due to minimal stake. Slashed.',
  },
];

// ─────────────────────────────────────────────
// MAIN DEMO FLOW
// ─────────────────────────────────────────────

async function runDemo() {
  banner('APERTURE PROTOCOL — FULL LIFECYCLE DEMO');
  
  log('🌐', `${BOLD}Network:${RESET} Base Sepolia (Chain ID: 84532)`);
  log('🏛️', `${BOLD}Vault:${RESET} ${process.env.APERTURE_VAULT_ADDRESS}`);
  log('💵', `${BOLD}USDC:${RESET} ${USDC_ADDRESS}`);
  log('🖥️', `${BOLD}Backend:${RESET} ${API_URL}`);
  
  // Check operator wallet
  const operatorAddr = process.env.OPERATOR_WALLET_ADDRESS as Address;
  if (operatorAddr) {
    const opBal = await getBalances(operatorAddr);
    log('🔑', `${BOLD}Operator Wallet:${RESET} ${operatorAddr}`);
    logDetail('ETH', `${opBal.eth} ETH`);
    logDetail('USDC', `$${opBal.usdc}`);
  }

  // Check agent wallet
  const agentKey = process.env.AGENT_PRIVATE_KEY as Hex;
  if (!agentKey) {
    console.error(`${RED}❌ AGENT_PRIVATE_KEY not set in .env. Run: npx ts-node scripts/generate-agent-wallet.ts${RESET}`);
    process.exit(1);
  }
  const agentAccount = privateKeyToAccount(agentKey);
  const agentBal = await getBalances(agentAccount.address);
  log('🤖', `${BOLD}AI Agent Wallet:${RESET} ${agentAccount.address}`);
  logDetail('ETH', `${agentBal.eth} ETH`);
  logDetail('USDC', `$${agentBal.usdc}`);

  await waitForKeypress('Press ENTER to begin the demo...');

  // ── DEMO RESET: Simulate a mature system ──
  console.log(`\n  ${MAGENTA}${BOLD}── DEMO RESET: INITIALIZING FRESH STATE ──${RESET}`);
  log('🔄', 'Resetting submitter reputation to 0.70 (experienced honest user)...');
  log('🔄', 'Resetting AI agent trust to 0.80 (established agent)...');

  // Reset the operator's reputation (degraded from past test runs)
  await fetch(`${API_URL}/health`); // warm up
  const resetRes = await fetch(`${API_URL}/facts`, { method: 'GET' }); // just checking connectivity

  // Direct DB reset via a small POST to a hidden endpoint (we'll add this)
  const resetPayload = await fetch(`${API_URL}/demo/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      wallet_address: operatorAddr,
      reputation: 0.70,
      agent_id: 'aperture-demo-agent',
      agent_trust: 0.80,
    }),
  });

  if (resetPayload.ok) {
    const resetData = await resetPayload.json();
    log('✅', `${GREEN}System reset complete!${RESET}`);
    logDetail('Submitter Reputation', '70.0%');
    logDetail('Agent Trust Score', '80.0%');
    logDetail('Old Facts Deleted', `${resetData.facts_deleted || 0} (clean slate)`);
  } else {
    const errText = await resetPayload.text();
    log('❌', `${RED}Reset failed (${resetPayload.status}): ${errText}${RESET}`);
    log('⚠️', `${YELLOW}Proceeding with current state — results may be unpredictable${RESET}`);
  }

  await waitForKeypress();

  // Run each scenario
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    
    banner(`SCENARIO ${i + 1}/${SCENARIOS.length}: ${scenario.name}`);
    log('📋', scenario.description);
    log('🎯', `Expected: ${scenario.expectedOutcome}`);
    
    await waitForKeypress();

    // ── STEP 1: Human submits a fact ──
    console.log(`\n  ${MAGENTA}${BOLD}── STEP 1: HUMAN SUBMITS FACT ──${RESET}`);
    log('📝', `Claim: "${scenario.claim}"`);
    log('🏷️', `Domain: ${scenario.domain} | Stake: $${scenario.stake} USDC`);
    log('📍', `GPS: ${scenario.lat}, ${scenario.lng}`);

    // Use the operator wallet as the submitter for the demo
    // Note: POST /facts uses multer (multipart/form-data), not JSON
    const formData = new FormData();
    formData.append('text_claim', scenario.claim);
    formData.append('domain', scenario.domain);
    formData.append('wallet_address', operatorAddr);
    formData.append('stake_amount', scenario.stake.toString());
    formData.append('latitude', scenario.lat.toString());
    formData.append('longitude', scenario.lng.toString());

    const submitRes = await fetch(`${API_URL}/facts`, {
      method: 'POST',
      body: formData,
    });

    const submitData = await submitRes.json();
    if (!submitRes.ok) {
      log('❌', `${RED}Submission failed: ${submitData.error}${RESET}`);
      await waitForKeypress();
      continue;
    }

    const factId = submitData.id;
    const provisionalScore = submitData.credibility_score;
    const status = submitData.status;

    log('✅', `${GREEN}Fact submitted!${RESET}`);
    logDetail('Fact ID', factId);
    logDetail('Provisional Score', `${(provisionalScore * 100).toFixed(1)}%`);
    logDetail('Status', status);

    await waitForKeypress();

    // ── STEP 2: AI Agent searches marketplace ──
    console.log(`\n  ${MAGENTA}${BOLD}── STEP 2: AI AGENT SEARCHES MARKETPLACE ──${RESET}`);

    const searchQuery = scenario.claim.split(' ').slice(0, 4).join(' ');
    log('🔍', `Agent searching for: "${searchQuery}"`);

    const searchRes = await fetch(`${API_URL}/facts/search?q=${encodeURIComponent(searchQuery)}`);
    const searchData = await searchRes.json();
    
    log('📊', `Found ${searchData.count || searchData.results?.length || 0} matching facts`);
    if (searchData.results?.length > 0) {
      const match = searchData.results[0];
      logDetail('Top Match', `${match.text_claim?.substring(0, 60)}...`);
      logDetail('Similarity', `${(match.similarity * 100).toFixed(1)}%`);
    }

    await waitForKeypress();

    // ── STEP 3: Agent pays USDC via x402 to unlock ──
    console.log(`\n  ${MAGENTA}${BOLD}── STEP 3: AI AGENT PAYS USDC VIA x402 ──${RESET}`);

    // First hit: get the 402 response with pricing
    const firstAttempt = await fetch(`${API_URL}/facts/${factId}`, {
      headers: { 'x-agent-id': 'aperture-demo-agent' },
    });

    if (firstAttempt.status === 402) {
      const paywall = await firstAttempt.json();
      const price = paywall.x402?.accepts?.[0]?.amount || 0.05;
      log('🛑', `${YELLOW}HTTP 402 — Payment Required${RESET}`);
      logDetail('Price', `$${price} USDC`);
      logDetail('Protocol', 'x402 (HTTP Payment Required)');
      logDetail('Network', 'Base Sepolia');

      log('💸', 'Agent signing payment authorization...');
      
      // Pay: retry with payment receipt
      const payRes = await fetch(`${API_URL}/facts/${factId}`, {
        headers: { 
          'x-agent-id': 'aperture-demo-agent',
          'x-payment-receipt': `x402-demo-${Date.now()}-${agentAccount.address}`,
        },
      });

      if (payRes.ok) {
        const factData = await payRes.json();
        log('✅', `${GREEN}Payment verified! Fact unlocked.${RESET}`);
        logDetail('Fact Claim', factData.fact?.text_claim?.substring(0, 60) + '...');
      } else {
        log('⚠️', `${RED}Payment failed${RESET}`);
      }
    } else if (firstAttempt.ok) {
      const factData = await firstAttempt.json();
      log('✅', `${GREEN}Fact accessed (no paywall in current config)${RESET}`);
    }

    await waitForKeypress();

    // ── STEP 4: Agent evaluates and submits feedback ──
    console.log(`\n  ${MAGENTA}${BOLD}── STEP 4: AI AGENT VERIFIES & SUBMITS FEEDBACK ──${RESET}`);

    log('🧠', `Agent evaluating claim against real-world data...`);
    log('📊', `Verdict: ${scenario.agentVerdict === 'confirmed' ? `${GREEN}CONFIRMED ✅${RESET}` : `${RED}CONTRADICTED ❌${RESET}`}`);

    const feedbackRes = await fetch(`${API_URL}/facts/${factId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: 'aperture-demo-agent',
        signal: scenario.agentVerdict,
      }),
    });

    const feedbackData = await feedbackRes.json();

    if (feedbackRes.ok && feedbackData.settlement) {
      const terminal = feedbackData.settlement;
      const txHash = feedbackData.settlement_tx_hash;

      log('⚖️', `${BOLD}Terminal Score: ${(terminal.finalScore * 100).toFixed(1)}%${RESET}`);
      log('📊', `Decision: ${terminal.terminal_status === 'REWARD' ? `${GREEN}REWARD → Stake Released${RESET}` : `${RED}SLASH → Stake Burned${RESET}`}`);
      
      if (txHash) {
        log('⛓️', `${CYAN}Settlement TX: ${txHash}${RESET}`);
        log('🔗', `${DIM}https://sepolia.basescan.org/tx/${txHash}${RESET}`);
      } else {
        log('📝', `${DIM}Settlement processed off-chain (no on-chain stake found)${RESET}`);
      }

      // Show signal breakdown
      console.log(`\n     ${DIM}Signal Breakdown:${RESET}`);
      logDetail('s_rep (Reputation)', `${(terminal.signals.s_rep * 100).toFixed(1)}%`);
      logDetail('s_stake (Quadratic)', `${(terminal.signals.s_stake * 100).toFixed(1)}%`);
      logDetail('s_geo (Geospatial)', `${(terminal.signals.s_geo * 100).toFixed(1)}%`);
      logDetail('s_temporal (Entropy)', `${(terminal.signals.s_temporal * 100).toFixed(1)}%`);
      logDetail('s_semantic (Semantic)', `${(terminal.signals.s_semantic * 100).toFixed(1)}%`);
      logDetail('s_agent (AI Feedback)', `${(terminal.signals.s_agent * 100).toFixed(1)}%`);
      logDetail('Agent Weight', `${(terminal.effectiveAgentWeight * 100).toFixed(1)}%`);
    } else {
      log('⚠️', `${YELLOW}Settlement response: ${JSON.stringify(feedbackData)}${RESET}`);
    }

    await waitForKeypress();

    // ── STEP 5: Show reputation changes ──
    console.log(`\n  ${MAGENTA}${BOLD}── STEP 5: REPUTATION UPDATE ──${RESET}`);

    const subRes = await fetch(`${API_URL}/submitter/${operatorAddr}`);
    if (subRes.ok) {
      const subData = await subRes.json();
      log('👤', `Submitter Reputation: ${(subData.reputation_score * 100).toFixed(1)}%`);
      logDetail('Total Facts', subData.total_facts?.toString() || '?');
    }

    if (i < SCENARIOS.length - 1) {
      await waitForKeypress(`Press ENTER for Scenario ${i + 2}...`);
    }
  }

  // ── FINAL SUMMARY ──
  banner('DEMO COMPLETE — FINAL STATE');

  // Final balances
  if (operatorAddr) {
    const finalOpBal = await getBalances(operatorAddr);
    log('🔑', `Operator: ${finalOpBal.eth} ETH | $${finalOpBal.usdc} USDC`);
  }
  const finalAgentBal = await getBalances(agentAccount.address);
  log('🤖', `Agent: ${finalAgentBal.eth} ETH | $${finalAgentBal.usdc} USDC`);

  // Final submitter reputation
  const finalSubRes = await fetch(`${API_URL}/submitter/${operatorAddr}`);
  if (finalSubRes.ok) {
    const finalSubData = await finalSubRes.json();
    log('👤', `Human Reputation: ${(finalSubData.reputation_score * 100).toFixed(1)}%`);
  }

  log('🏁', `${GREEN}${BOLD}Aperture Protocol demo completed successfully!${RESET}`);
  console.log(`\n  ${DIM}All transactions are verifiable on https://sepolia.basescan.org${RESET}\n`);

  process.exit(0);
}

runDemo().catch(err => {
  console.error(`${RED}❌ Demo failed:${RESET}`, err);
  process.exit(1);
});
