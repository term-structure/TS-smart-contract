import { BigNumber, utils, Signer } from "ethers";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ethers } from "hardhat";
import { EMPTY_HASH } from "term-structure-sdk";
import { FACET_NAMES } from "../../../utils/config";
import { useFacet } from "../../../utils/useFacet";
import { deployAndInit } from "../../utils/deployAndInit";
import { whiteListBaseTokens } from "../../utils/whitelistToken";
import { BaseTokenAddresses } from "../../../utils/type";
import { StoredBlockStruct } from "../../../typechain-types/contracts/zkTrueUp/rollup/RollupFacet";
import {
  AccountFacet,
  ProtocolParamsFacet,
  LoanFacet,
  RollupFacet,
  TokenFacet,
  TsbFacet,
  ZkTrueUp,
} from "../../../typechain-types";
import {
  Users,
  preprocessAndRollupBlocks,
} from "../../utils/rollBorrowRollupHelper";
import { rollupData } from "../../data/rollup/test_data";

const initStateRoot = utils.hexZeroPad(
  utils.hexlify(BigInt(rollupData.initState.stateRoot)),
  32
);

const fixture = async () => {
  const res = await deployAndInit(FACET_NAMES, false, undefined, initStateRoot);
  const diamondToken = (await useFacet(
    "TokenFacet",
    res.zkTrueUp.address
  )) as TokenFacet;
  await whiteListBaseTokens(
    res.baseTokenAddresses,
    res.priceFeeds,
    diamondToken,
    res.operator
  );
  return res;
};

describe("Rollup", function () {
  let [user1, user2, user3, user4]: Signer[] = [];
  let accounts: Users;
  const storedBlocks: StoredBlockStruct[] = [];
  const genesisBlock: StoredBlockStruct = {
    blockNumber: BigNumber.from("0"),
    stateRoot: initStateRoot,
    l1RequestNum: BigNumber.from("0"),
    pendingRollupTxHash: EMPTY_HASH,
    commitment: utils.defaultAbiCoder.encode(
      ["bytes32"],
      [String("0x").padEnd(66, "0")]
    ),
    timestamp: BigNumber.from("0"),
  };
  let operator: Signer;
  let zkTrueUp: ZkTrueUp;
  let diamondAcc: AccountFacet;
  let diamondProtocolParams: ProtocolParamsFacet;
  let diamondLoan: LoanFacet;
  let diamondRollup: RollupFacet;
  let diamondTsb: TsbFacet;
  let diamondToken: TokenFacet;
  let baseTokenAddresses: BaseTokenAddresses;

  before(async function () {
    const res = await loadFixture(fixture);
    operator = res.operator;
    zkTrueUp = res.zkTrueUp;
    [user1, user2, user3, user4] = await ethers.getSigners();
    accounts = new Users(await ethers.getSigners());
    rollupData.user_data.forEach((user) =>
      accounts.addUser(user.tsPubKeyX, user.tsPubKeyY)
    );
    const zkTrueUpAddr = zkTrueUp.address;
    diamondAcc = (await useFacet("AccountFacet", zkTrueUpAddr)) as AccountFacet;
    diamondProtocolParams = (await useFacet(
      "ProtocolParamsFacet",
      zkTrueUpAddr
    )) as ProtocolParamsFacet;
    diamondLoan = (await useFacet("LoanFacet", zkTrueUpAddr)) as LoanFacet;
    diamondRollup = (await useFacet(
      "RollupFacet",
      zkTrueUpAddr
    )) as RollupFacet;
    diamondTsb = (await useFacet("TsbFacet", zkTrueUpAddr)) as TsbFacet;
    diamondToken = (await useFacet("TokenFacet", zkTrueUpAddr)) as TokenFacet;
    baseTokenAddresses = res.baseTokenAddresses;
    storedBlocks.push(genesisBlock);
  });

  it(`Success to rollup block`, async function () {
    const NumOfPreProcessBlocks = rollupData.blocks.length;
    await preprocessAndRollupBlocks(
      NumOfPreProcessBlocks,
      rollupData,
      diamondAcc,
      diamondRollup,
      diamondTsb,
      diamondToken,
      diamondLoan,
      operator,
      accounts,
      baseTokenAddresses,
      genesisBlock
    );
  });
});
