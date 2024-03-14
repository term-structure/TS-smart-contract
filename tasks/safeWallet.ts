import { Wallet } from "ethers";
import { task } from "hardhat/config";
import { getMNEMONIC, getProvider, getWallets, undefined_check } from "./utils";
import Safe, {
  ContractNetworksConfig,
  EthersAdapter,
  SafeAccountConfig,
  SafeFactory,
} from "@safe-global/protocol-kit";

task("deploy-safe", "Deploy multisig safe wallets").setAction(
  async (_, hre) => {
    const provider = getProvider(hre);
    const MNEMONIC = getMNEMONIC(hre);
    const wallets = getWallets(hre, MNEMONIC);

    // if (hre.network.name != "localhost") {
    const ceo_private_key = wallets[100].privateKey;
    const ceo = new Wallet(ceo_private_key, provider);
    const cto_private_key = wallets[101].privateKey;
    const cto = new Wallet(cto_private_key, provider);
    const coo_private_key = wallets[102].privateKey;
    const coo = new Wallet(coo_private_key, provider);

    console.log(`CEO - Addr:${await ceo.getAddress()} PK:${ceo.privateKey}`);
    console.log(`CTO - Addr:${await cto.getAddress()} PK:${cto.privateKey}`);
    console.log(`COO - Addr:${await coo.getAddress()} PK:${coo.privateKey}`);

    const ceo_signer = provider.getSigner(await ceo.getAddress());
    const ethers = hre.ethers;
    const ethAdapter_ceo = new EthersAdapter({
      ethers,
      signerOrProvider: ceo_signer,
    });

    const chainId = (await ethAdapter_ceo.getChainId()).toString();
    const contractNetworks: ContractNetworksConfig = {
      [chainId]: {
        safeMasterCopyAddress: "0xd9Db270c1B5E3Bd161E8c8503c55cEABeE709552",
        safeProxyFactoryAddress: "0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2",
        multiSendAddress: "0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761",
        multiSendCallOnlyAddress: "0x40A2aCCbd92BCA938b02010E17A5b8929b49130D",
        fallbackHandlerAddress: "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4",
        signMessageLibAddress: "0xA65387F16B013cf2Af4605Ad8aA5ec25a2cbA3a2",
        createCallAddress: "0x7cbB62EaA69F79e6873cD1ecB2392971036cFAa4",
        simulateTxAccessorAddress: "0x59AD6735bCd8152B84860Cb256dD9e96b85F69Da",
      },
    };
    const safeFactory = await SafeFactory.create({
      ethAdapter: ethAdapter_ceo,
      contractNetworks: contractNetworks,
      //   isL1SafeMasterCopy: true,
    });

    const owners = [
      await ceo.getAddress(),
      await cto.getAddress(),
      await coo.getAddress(),
    ];
    const threshold = 2;
    const safeAccountConfig: SafeAccountConfig = {
      owners: owners,
      threshold: threshold,
    };
    console.log("test");
    const admin: Safe = await safeFactory.deploySafe({ safeAccountConfig });
    console.log("test1");
    const treasury: Safe = await safeFactory.deploySafe({
      safeAccountConfig,
    });
    const vault: Safe = await safeFactory.deploySafe({ safeAccountConfig });
    const insurance: Safe = await safeFactory.deploySafe({
      safeAccountConfig,
    });
    const adminAddr = await admin.getAddress();
    const treasuryAddr = await treasury.getAddress();
    const vaultAddr = await vault.getAddress();
    const insuranceAddr = await insurance.getAddress();

    console.log({ adminAddr, treasuryAddr, vaultAddr, insuranceAddr });
    return {
      adminAddr,
      treasuryAddr,
      vaultAddr,
      insuranceAddr,
    };
    //     } else {
    //       const ceo_private_key = wallets[100].privateKey;
    //       const ceo = new Wallet(ceo_private_key, provider);
    //       const adminAddr = await ceo.getAddress();
    //       const treasuryAddr = await ceo.getAddress();
    //       const vaultAddr = await ceo.getAddress();
    //       const insuranceAddr = await ceo.getAddress();

    //       return {
    //         adminAddr,
    //         treasuryAddr,
    //         vaultAddr,
    //         insuranceAddr,
    //       };
    //     }
  }
);

task("get-safeAddress", "Get multisig safe wallets address").setAction(
  async (_, hre) => {
    let adminAddr;
    let treasuryAddr;
    let vaultAddr;
    let insuranceAddr;
    if (hre.network.name == "mainnet") {
      adminAddr = undefined_check(process.env.MAINNET_ADMIN_ADDRESS);
      treasuryAddr = undefined_check(process.env.MAINNET_TREASURY_ADDRESS);
      vaultAddr = undefined_check(process.env.MAINNET_VAULT_ADDRESS);
      insuranceAddr = undefined_check(process.env.MAINNET_INSURANCE_ADDRESS);
      return {
        adminAddr,
        treasuryAddr,
        vaultAddr,
        insuranceAddr,
      };
    } else if (hre.network.name == "goerli") {
      adminAddr = undefined_check(process.env.GOERLI_ADMIN_ADDRESS);
      treasuryAddr = undefined_check(process.env.GOERLI_TREASURY_ADDRESS);
      vaultAddr = undefined_check(process.env.GOERLI_VAULT_ADDRESS);
      insuranceAddr = undefined_check(process.env.GOERLI_INSURANCE_ADDRESS);
      return {
        adminAddr,
        treasuryAddr,
        vaultAddr,
        insuranceAddr,
      };
    } else if (hre.network.name == "dev" || hre.network.name == "localhost") {
      const safeAddresses = await hre.run("deploy-safe");
      return safeAddresses;
    } else if (hre.network.name == "hardhat") {
      const MNEMONIC = getMNEMONIC(hre);
      const wallets = getWallets(hre, MNEMONIC);
      adminAddr = wallets[90].address;
      treasuryAddr = wallets[91].address;
      vaultAddr = wallets[92].address;
      insuranceAddr = wallets[93].address;
      return {
        adminAddr,
        treasuryAddr,
        vaultAddr,
        insuranceAddr,
      };
    } else {
      throw new Error("Invalid network");
    }
  }
);
