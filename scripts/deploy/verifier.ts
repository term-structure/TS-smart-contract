import { Wallet } from "ethers";
import { ethers } from "hardhat";
import { getString } from "../../utils/type";

export const main = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    process.env.GOERLI_RPC_URL
  );
  const deployerPrivKey = getString(process.env.GOERLI_DEPLOYER_PRIVATE_KEY);
  const deployer = new Wallet(deployerPrivKey, provider);
  const genesisStateRoot = getString(process.env.GOERLI_GENESIS_STATE_ROOT);

  console.log(
    "Deploying contracts with deployer:",
    await deployer.getAddress()
  );

  console.log("Genesis state root: ", genesisStateRoot);

  // deploy verifier
  console.log("Deploying Verifier...");
  const Verifier = await ethers.getContractFactory("Verifier");
  const verifier = await Verifier.connect(deployer).deploy();
  await verifier.deployed();
  console.log("verifier addr:", verifier.address);

  const zkTrueUpAddr = "0x0Ca04b6a3A9786C4c34f82947Ab5a8Ce2D380473";
  const addressFacet = await ethers.getContractAt("AddressFacet", zkTrueUpAddr);
  console.log("addressFacet addr:", addressFacet.address);
  const originalVerifier = await addressFacet.getVerifier();
  const tx = await addressFacet.connect(deployer).setVerifier(verifier.address);
  await tx.wait();
  const newVerifier = await addressFacet.getVerifier();
  console.log("original verifier:", originalVerifier);
  console.log("new verifier:", newVerifier);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
