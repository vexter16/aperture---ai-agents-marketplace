import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createPublicClient, http, formatEther, formatUnits, parseAbi, Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import dotenv from 'dotenv';
dotenv.config();

const USDC_ADDRESS = (process.env.USDC_CONTRACT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address;

const ERC20_ABI = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);

async function main() {
  // Check if an agent key already exists
  if (process.env.AGENT_PRIVATE_KEY) {
    console.log('✅ Agent wallet already configured in .env');
    const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`);
    console.log(`   Address: ${account.address}`);
    
    // Check balances
    const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.RPC_URL) });
    const ethBalance = await client.getBalance({ address: account.address });
    const usdcBalance = await client.readContract({
      address: USDC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [account.address],
    });
    
    console.log(`   ETH Balance: ${formatEther(ethBalance)} ETH`);
    console.log(`   USDC Balance: $${formatUnits(usdcBalance, 6)} USDC`);
    return;
  }

  // Generate a new wallet
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  🤖 APERTURE AI AGENT WALLET GENERATED');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Address:     ${account.address}`);
  console.log(`  Private Key: ${privateKey}`);
  console.log('');
  console.log('  ⚠️  ACTION REQUIRED:');
  console.log('  1. Add this line to your .env file:');
  console.log(`     AGENT_PRIVATE_KEY=${privateKey}`);
  console.log('');
  console.log('  2. Fund this wallet on Base Sepolia with:');
  console.log('     - ~0.01 ETH (for gas) → Use https://faucet.quicknode.com/base/sepolia');
  console.log(`     - ~$5 USDC → Send from MetaMask to ${account.address}`);
  console.log('═══════════════════════════════════════════════════════');
}

main().catch(console.error);
