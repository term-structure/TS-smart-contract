import Safe, {
  SafeFactory,
  EthersAdapter,
  SafeAccountConfig,
} from "@safe-global/protocol-kit";
import { ethers } from "ethers";

const provider = new ethers.providers.JsonRpcProvider("YOUR_RPC_URL");
const initiatorWallet = new ethers.Wallet(
  process.env.DEVNET_DEPLOYER_PRIVATE_KEY || "",
  provider
); // The initiator who starts the transaction
const ethAdapter = new EthersAdapter({
  ethers,
  signerOrProvider: initiatorWallet,
});

async function collectSignatures(
  safeTxHash: string,
  owners: string[]
): Promise<string[]> {
  const signatures: string[] = [];

  for (const ownerPrivateKey of owners) {
    const ownerWallet = new ethers.Wallet(ownerPrivateKey, provider);
    const signature = await ownerWallet.signMessage(
      ethers.utils.arrayify(safeTxHash)
    );
    signatures.push(signature);
  }

  return signatures;
}

async function main() {
  // Initialize Gnosis Safe SDK
  const safeFactory = await SafeFactory.create({ ethAdapter });

  // Load a Safe
  const safe = await safeFactory.loadSafe("YOUR_GNOSIS_SAFE_ADDRESS");

  // Define the Diamond contract interaction
  const diamondContract = new ethers.Contract(
    "DIAMOND_CONTRACT_ADDRESS",
    "DIAMOND_CONTRACT_ABI",
    initiatorWallet
  );
  const txData = diamondContract.interface.encodeFunctionData("someFunction", [
    /* arguments if any */
  ]);

  // Create a Safe transaction
  const safeTx = {
    to: diamondContract.address,
    data: txData,
    value: "0",
    operation: Safe.OPERATIONS.CALL,
  };

  // Propose the transaction
  const safeTxHash = await safe.getTransactionHash(safeTx);
  console.log("Safe Transaction Hash:", safeTxHash);

  // Sign the transaction with the initiator
  const initiatorSignature = await ethAdapter.signMessage(safeTxHash);
  await safe.signTransactionHash(safeTxHash, initiatorSignature);

  // Collect additional signatures
  const ownerPrivateKeys = ["OWNER_1_PRIVATE_KEY", "OWNER_2_PRIVATE_KEY"]; // Replace with actual private keys
  const additionalSignatures = await collectSignatures(
    safeTxHash,
    ownerPrivateKeys
  );
  for (const sig of additionalSignatures) {
    await safe.signTransactionHash(safeTxHash, sig);
  }

  // Once you have enough signatures, you can execute the transaction
  const txResponse = await safe.executeTransaction(safeTx);
  console.log("Transaction mined:", txResponse.transactionHash);
}

main().catch(console.error);
