import { BigNumber, Signer } from "ethers";
import { ethers } from "hardhat";
import { RoundData } from "../../utils/type";
import { OracleMock } from "../../typechain-types";

export const updateRoundData = async (
  operator: Signer,
  priceFeed: string,
  roundDataJSON: RoundData
) => {
  const roundData = {
    roundId: roundDataJSON.roundId,
    answer: BigNumber.from(roundDataJSON.answer),
    startedAt: roundDataJSON.startedAt,
    updatedAt: roundDataJSON.updatedAt,
    answeredInRound: roundDataJSON.answeredInRound,
  };
  const oracle = (await ethers.getContractAt(
    "OracleMock",
    priceFeed
  )) as OracleMock;
  await oracle.connect(operator).updateRoundData(roundData);
  return await oracle.latestRoundData();
};
