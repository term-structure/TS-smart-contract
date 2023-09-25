import { ethers } from "ethers";

async function main() {
  const mnemonic = ethers.utils.entropyToMnemonic(ethers.utils.randomBytes(16));
  console.log("mnemonic: ", mnemonic, "\n");
  const node = ethers.utils.HDNode.fromMnemonic(mnemonic);

  for (let i = 0; i < 100; i++) {
    // eslint-disable-next-line quotes
    const wallet = node.derivePath("m/44'/60'/0'/0/" + i);
    console.log(`\n[${i}] ` + ":");
    console.log("  ADDRESS: ", wallet.address);
    console.log("  PRIVATE_KEY: ", wallet.privateKey);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
