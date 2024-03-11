import { BigNumber } from "ethers";

export const DELEGATE_WITHDRAW_MASK = BigNumber.from(1).shl(255);
export const DELEGATE_REMOVE_COLLATERAL_MASK = BigNumber.from(1).shl(254);
export const DELEGATE_REPAY_MASK = BigNumber.from(1).shl(253);
export const DELEGATE_ROLL_TO_AAVE_MASK = BigNumber.from(1).shl(252);
export const DELEGATE_ROLL_BORROW_MASK = BigNumber.from(1).shl(251);
export const DELEGATE_FORCE_CANCEL_ROLL_BORROW_MASK =
  BigNumber.from(1).shl(250);
export const DELEGATE_REDEEM_MASK = BigNumber.from(1).shl(249);
