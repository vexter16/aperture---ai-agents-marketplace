/**
 * Blockchain Service — Aperture Protocol
 * 
 * Handles all on-chain interactions with the ApertureVault smart contract
 * on Base Sepolia testnet using the viem library.
 * 
 * The operator wallet (from .env) is used ONLY for settlement (release/slash).
 * Stake locking is done by the human's own wallet from the Flutter app.
 */

import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, Hash, Address, Hex } from 'viem';
import { baseSepolia } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ─────────────────────────────────────────────
// CONFIGURATION
// ─────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const OPERATOR_PRIVATE_KEY = process.env.OPERATOR_PRIVATE_KEY as Hex | undefined;
const VAULT_ADDRESS = process.env.APERTURE_VAULT_ADDRESS as Address | undefined;
const USDC_ADDRESS = (process.env.USDC_CONTRACT_ADDRESS || '0x036CbD53842c5426634e7929541eC2318f3dCF7e') as Address;

// ─────────────────────────────────────────────
// ABI (Only the functions we need)
// ─────────────────────────────────────────────

const VAULT_ABI = parseAbi([
  'function stakeFact(bytes32 factId, uint256 amount) external',
  'function releaseStake(bytes32 factId) external',
  'function slashStake(bytes32 factId) external',
  'function getStake(bytes32 factId) view returns (address staker, uint256 amount, uint8 status, uint256 lockedAt, uint256 settledAt)',
  'function totalLocked() view returns (uint256)',
  'event StakeLocked(bytes32 indexed factId, address indexed staker, uint256 amount)',
  'event StakeReleased(bytes32 indexed factId, address indexed staker, uint256 amount)',
  'event StakeSlashed(bytes32 indexed factId, address indexed staker, uint256 amount)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
]);

// ─────────────────────────────────────────────
// CLIENTS
// ─────────────────────────────────────────────

// Public client for read-only operations (no private key needed)
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(RPC_URL),
});

// Wallet client for operator settlement transactions (needs private key)
function getOperatorWalletClient() {
  if (!OPERATOR_PRIVATE_KEY) {
    throw new Error('OPERATOR_PRIVATE_KEY not set in .env — cannot sign settlement transactions');
  }
  const account = privateKeyToAccount(OPERATOR_PRIVATE_KEY);
  return createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(RPC_URL),
  });
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/**
 * Convert a UUID string (e.g., "a1b2c3d4-e5f6-...") to bytes32 for the smart contract.
 * We strip hyphens and pad to 32 bytes.
 */
export function uuidToBytes32(uuid: string): Hex {
  const hex = uuid.replace(/-/g, '');
  return `0x${hex.padEnd(64, '0')}` as Hex;
}

/**
 * Convert a USDC dollar amount (e.g., 2.50) to the on-chain uint256 format.
 * USDC uses 6 decimals, so $2.50 = 2500000
 */
export function usdcToUnits(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

/**
 * Convert on-chain USDC units back to a human-readable dollar amount.
 */
export function unitsToUsdc(units: bigint): number {
  return Number(units) / 1_000_000;
}

// ─────────────────────────────────────────────
// BLOCKCHAIN STATUS CHECK
// ─────────────────────────────────────────────

/**
 * Check if the blockchain service is properly configured and reachable.
 */
export async function getBlockchainStatus(): Promise<{
  configured: boolean;
  network: string;
  operatorAddress: string | null;
  vaultAddress: string | null;
  blockNumber: number | null;
}> {
  try {
    const blockNumber = await publicClient.getBlockNumber();
    const operatorAddress = OPERATOR_PRIVATE_KEY 
      ? privateKeyToAccount(OPERATOR_PRIVATE_KEY).address 
      : null;
    
    return {
      configured: !!(OPERATOR_PRIVATE_KEY && VAULT_ADDRESS),
      network: 'base-sepolia',
      operatorAddress,
      vaultAddress: VAULT_ADDRESS || null,
      blockNumber: Number(blockNumber),
    };
  } catch (err) {
    return {
      configured: false,
      network: 'base-sepolia',
      operatorAddress: null,
      vaultAddress: null,
      blockNumber: null,
    };
  }
}

// ─────────────────────────────────────────────
// GENERATE STAKE TRANSACTION DATA
// (For the Flutter app to sign with the human's own wallet)
// ─────────────────────────────────────────────

/**
 * Generate the raw transaction data that the Flutter app needs to:
 * 1. Approve USDC spending by the vault
 * 2. Call stakeFact() on the vault
 * 
 * The Flutter app signs and sends these transactions using the human's private key.
 */
export function getStakeTransactionData(factId: string, amountUsdc: number) {
  if (!VAULT_ADDRESS) throw new Error('APERTURE_VAULT_ADDRESS not set in .env');
  
  const factIdBytes32 = uuidToBytes32(factId);
  const amountUnits = usdcToUnits(amountUsdc);
  
  // Step 1: USDC.approve(vaultAddress, amount)
  const approveData = encodeFunctionData({
    abi: ERC20_ABI,
    functionName: 'approve',
    args: [VAULT_ADDRESS, amountUnits],
  });
  
  // Step 2: vault.stakeFact(factId, amount)
  const stakeData = encodeFunctionData({
    abi: VAULT_ABI,
    functionName: 'stakeFact',
    args: [factIdBytes32, amountUnits],
  });
  
  return {
    approveTransaction: {
      to: USDC_ADDRESS,
      data: approveData,
      chainId: 84532,
    },
    stakeTransaction: {
      to: VAULT_ADDRESS,
      data: stakeData,
      chainId: 84532,
    },
    factIdBytes32,
    amountUnits: amountUnits.toString(),
  };
}

// ─────────────────────────────────────────────
// OPERATOR SETTLEMENT (Backend signs these)
// ─────────────────────────────────────────────

/**
 * Release a stake back to the human (REWARD — fact confirmed true).
 * Called by the backend after the Credibility Engine + Agent feedback settles.
 */
export async function releaseStakeOnChain(factId: string): Promise<Hash> {
  if (!VAULT_ADDRESS) throw new Error('APERTURE_VAULT_ADDRESS not set');
  
  const walletClient = getOperatorWalletClient();
  const factIdBytes32 = uuidToBytes32(factId);
  
  console.log(`🔓 [Blockchain] Releasing stake for fact ${factId.substring(0, 8)}...`);
  
  const hash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'releaseStake',
    args: [factIdBytes32],
  });
  
  // Wait for the transaction to be mined
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`✅ [Blockchain] Stake released! TX: ${hash} | Block: ${receipt.blockNumber}`);
  
  return hash;
}

/**
 * Verify a stake transaction hash that a mobile client submits.
 * Ensures the transaction was successfully mined and did not revert out of gas.
 */
export async function verifyStakeTransaction(hashHex: string): Promise<boolean> {
  try {
    const hash = hashHex as Hash;
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60000 });
    return receipt.status === 'success';
  } catch (e) {
    console.error(`❌ [Blockchain] Failed to verify transaction ${hashHex}:`, e);
    return false;
  }
}

/**
 * Slash a stake (PUNISHMENT — fact confirmed false).
 * Called by the backend when the Credibility Engine determines the claim was false.
 */
export async function slashStakeOnChain(factId: string): Promise<Hash> {
  if (!VAULT_ADDRESS) throw new Error('APERTURE_VAULT_ADDRESS not set');
  
  const walletClient = getOperatorWalletClient();
  const factIdBytes32 = uuidToBytes32(factId);
  
  console.log(`🔥 [Blockchain] Slashing stake for fact ${factId.substring(0, 8)}...`);
  
  const hash = await walletClient.writeContract({
    address: VAULT_ADDRESS,
    abi: VAULT_ABI,
    functionName: 'slashStake',
    args: [factIdBytes32],
  });
  
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`🔥 [Blockchain] Stake slashed! TX: ${hash} | Block: ${receipt.blockNumber}`);
  
  return hash;
}

// ─────────────────────────────────────────────
// READ FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Get the on-chain status of a stake.
 */
export async function getStakeOnChain(factId: string) {
  if (!VAULT_ADDRESS) return null;
  
  const factIdBytes32 = uuidToBytes32(factId);
  
  try {
    const result = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'getStake',
      args: [factIdBytes32],
    });
    
    const [staker, amount, status, lockedAt, settledAt] = result as [Address, bigint, number, bigint, bigint];
    const statusMap = ['None', 'Locked', 'Released', 'Slashed'];
    
    return {
      staker,
      amount: unitsToUsdc(amount),
      status: statusMap[status] || 'Unknown',
      lockedAt: Number(lockedAt),
      settledAt: Number(settledAt),
    };
  } catch (err) {
    console.error(`⚠️ [Blockchain] Failed to read stake for ${factId}:`, err);
    return null;
  }
}

/**
 * Get the USDC balance of a wallet.
 */
export async function getUsdcBalance(walletAddress: string): Promise<number> {
  try {
    const balance = await publicClient.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [walletAddress as Address],
    });
    return unitsToUsdc(balance as bigint);
  } catch (err) {
    console.error(`⚠️ [Blockchain] Failed to get USDC balance:`, err);
    return 0;
  }
}

/**
 * Get the total USDC locked in the vault.
 */
export async function getTotalLocked(): Promise<number> {
  if (!VAULT_ADDRESS) return 0;
  
  try {
    const total = await publicClient.readContract({
      address: VAULT_ADDRESS,
      abi: VAULT_ABI,
      functionName: 'totalLocked',
    });
    return unitsToUsdc(total as bigint);
  } catch (err) {
    return 0;
  }
}
