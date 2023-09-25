export function undefined_check(value: any) {
  if (value === undefined) {
    throw new Error("Value is undefined");
  }
  return value;
}

export function getProvider(hre: any) {
  if (hre.network.name == "mainnet") {
    const jsonRpcUrl = undefined_check(process.env.MAINNET_RPC_URL);
    return new hre.ethers.providers.JsonRpcProvider(jsonRpcUrl);
  } else if (hre.network.name == "goerli") {
    const jsonRpcUrl = undefined_check(process.env.GOERLI_RPC_URL);
    return new hre.ethers.providers.JsonRpcProvider(jsonRpcUrl);
  } else if (hre.network.name == "dev") {
    const jsonRpcUrl = undefined_check(process.env.DEVNET_RPC_URL);
    return new hre.ethers.providers.JsonRpcProvider(jsonRpcUrl);
  } else if (hre.network.name == "localhost") {
    const jsonRpcUrl = "http://127.0.0.1:8545";
    return new hre.ethers.providers.JsonRpcProvider(jsonRpcUrl);
  } else if (hre.network.name == "hardhat") {
    return hre.ethers.provider;
  } else {
    throw new Error("Invalid network");
  }
}

export function getMNEMONIC(hre: any) {
  if (hre.network.name == "dev") {
    return undefined_check(process.env.DEVNET_MNEMONIC);
  } else if (hre.network.name == "hardhat" || hre.network.name == "localhost") {
    // return "test test test test test test test test test test test junk";
    return "liberty bracket number hire knee squeeze cute discover anxiety argue such glory";
  } else {
    throw new Error("Invalid network");
  }
}

export function getWallets(hre: any, MNEMONIC: string) {
  const node = hre.ethers.utils.HDNode.fromMnemonic(MNEMONIC);
  const wallets = [];
  for (let i = 0; i < 1000; i++) {
    // eslint-disable-next-line quotes
    const path = "m/44'/60'/0'/0/" + i;
    const wallet = node.derivePath(path);
    wallets.push(wallet);
  }
  return wallets;
}
