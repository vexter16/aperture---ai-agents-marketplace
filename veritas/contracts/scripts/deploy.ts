import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("🚀 Deploying ApertureVault with account:", deployer.address);
  console.log("   Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Base Sepolia USDC address (official Circle testnet USDC)
  const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  
  // Treasury = deployer for testnet (slashed funds go here)
  const TREASURY_ADDRESS = deployer.address;

  console.log("\n📋 Configuration:");
  console.log("   USDC Token:", USDC_ADDRESS);
  console.log("   Treasury:", TREASURY_ADDRESS);
  console.log("   Network: Base Sepolia (Chain ID: 84532)");

  // Deploy
  const ApertureVault = await ethers.getContractFactory("ApertureVault");
  const vault = await ApertureVault.deploy(USDC_ADDRESS, TREASURY_ADDRESS);
  await vault.waitForDeployment();

  const vaultAddress = await vault.getAddress();
  
  console.log("\n✅ ApertureVault deployed to:", vaultAddress);
  console.log("\n📝 Add this to your backend/.env file:");
  console.log(`   APERTURE_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`   USDC_CONTRACT_ADDRESS=${USDC_ADDRESS}`);
  console.log("\n🔍 Verify on BaseScan:");
  console.log(`   https://sepolia.basescan.org/address/${vaultAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
