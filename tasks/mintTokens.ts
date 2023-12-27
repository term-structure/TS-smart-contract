import { task } from "hardhat/config";

task("mint-tokens", "Mint tokens").setAction(async (_, hre) => {
  const accounts = await hre.ethers.getSigners();

  const addresses = [
    "0x8A84d53694207d402A36D7B28698f8eE0A43b573",
    "0x6e24f0fF0337edf4af9c67bFf22C402302fc94D3",
    "0x9cd0f93381B22e80afB7401b61569e21E694F9A3",
    "0xFb4952C9B6f049D1D5C21bE2900E1dcDA974115d",
    "0x300281E04c0F18F19867D5267E4BFea73d9a2d17",
    "0xCCebFb0C79b8EfA16A7e8037A89cEfD26d95aE51",
    "0xE41832595DCB78ced7175184Ae5c85e13F3711E6",
    "0xD6E376Eb34E2d3b1104bA14c3c408b1ab82A85aE",
    "0xd6273eF1B120A53b246e8FBD1990B7213faFC6ea",
    "0x0D7AAB2618929C30C035101F15ccbe98F6e45767",
  ];

  const tokens = [
    "0x73f3F50035AB031a97586d29615DD15398De19a4",
    "0x6A8E7357ffAe20b6b31311d21096207941B18bC2",
    "0x1AfAB1578C26b012920E6a95513cA7E85CB21080",
    "0xBa2B5A4b1a8930ACC5e142ef0Eda3FFcEd0be3B8",
    "0x7e3CED9732aBFfA506bcBDF7DbfC0F62Fa644169",
  ];
  const faucet = await hre.ethers.getContractAt(
    "TsFaucet",
    "0x3A9810Ff7d44B4CE1855C581D2b3Dd76A5fF8bBc"
  );
  const mintAmt = hre.ethers.BigNumber.from("10000000000000000000");
  const faucetOperator = accounts[2];
  let nonce = await faucetOperator.getTransactionCount();
  for (let i = 0; i < addresses.length; i++) {
    console.log(`Mint tokens for ${addresses[i]}`);
    for (let j = 0; j < tokens.length; j++) {
      const token = await hre.ethers.getContractAt("TsERC20", tokens[j]);
      const amount = mintAmt.mul(
        hre.ethers.BigNumber.from("10").pow(await token.decimals())
      );
      const tx = await faucet
        .connect(faucetOperator)
        .devMint(addresses[i], tokens[j], amount, {
          gasPrice: hre.ethers.utils.parseUnits("10", "gwei"),
          nonce: nonce,
        });
      nonce++;
      await tx.wait();
      console.log(
        `  - token: ${await token.symbol()} (${
          token.address
        }) amount: ${amount.toString()}`
      );
    }
    console.log();
  }
});
