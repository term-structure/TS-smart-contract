// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {RollupStorage} from "../rollup/RollupStorage.sol";
import {ProtocolParamsStorage, FundWeight, ProtocolFeeRecipient} from "./ProtocolParamsStorage.sol";
import {IProtocolParamsFacet} from "./IProtocolParamsFacet.sol";
import {TokenStorage} from "../token/TokenStorage.sol";
import {RollupLib} from "../rollup/RollupLib.sol";
import {ProtocolParamsLib} from "./ProtocolParamsLib.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {Utils} from "../libraries/Utils.sol";
import {Config} from "../libraries/Config.sol";

/**
 * @title Term Structure Protocol Params Facet Contract
 * @author Term Structure Labs
 * @notice The ProtocolParamsFacet contract is used to store the protocol parameters which are used by the Term Structure Protocol.
 */
contract ProtocolParamsFacet is IProtocolParamsFacet, AccessControlInternal {
    using ProtocolParamsLib for ProtocolParamsStorage.Layout;
    using TokenLib for TokenStorage.Layout;
    using RollupLib for RollupStorage.Layout;

    /* ============ External Functions ============ */

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function withdrawProtocolFee(
        ProtocolFeeRecipient receiver,
        IERC20 token,
        uint256 amount
    ) external onlyRole(Config.ADMIN_ROLE) {
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        uint16 tokenId = tsl.getValidTokenId(token);

        ProtocolParamsStorage.Layout storage ppsl = ProtocolParamsStorage.layout();
        address payable receiverAddr;
        if (receiver == ProtocolFeeRecipient.Treasury) {
            receiverAddr = ppsl.getTreasuryAddr();
        } else if (receiver == ProtocolFeeRecipient.Insurance) {
            receiverAddr = ppsl.getInsuranceAddr();
        } else if (receiver == ProtocolFeeRecipient.Vault) {
            receiverAddr = ppsl.getVaultAddr();
        } else {
            revert InvalidFeeRecepient(receiverAddr);
        }

        RollupStorage.Layout storage rsl = RollupStorage.layout();
        rsl.updateWithdrawalRecord(receiverAddr, tokenId, amount);
        Utils.transfer(token, receiverAddr, amount);
        emit ProtocolFeeWithdrawn(receiverAddr, token, amount);
    }

    /* ============ External Admin Functions ============ */

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setTreasuryAddr(address payable treasuryAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.notZeroAddr(treasuryAddr);
        ProtocolParamsStorage.layout().treasuryAddr = treasuryAddr;
        emit SetTreasuryAddr(treasuryAddr);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setInsuranceAddr(address payable insuranceAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.notZeroAddr(insuranceAddr);
        ProtocolParamsStorage.layout().insuranceAddr = insuranceAddr;
        emit SetInsuranceAddr(insuranceAddr);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setVaultAddr(address payable vaultAddr) external onlyRole(Config.ADMIN_ROLE) {
        Utils.notZeroAddr(vaultAddr);
        ProtocolParamsStorage.layout().vaultAddr = vaultAddr;
        emit SetVaultAddr(vaultAddr);
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function setFundWeight(FundWeight memory fundWeight) external onlyRole(Config.ADMIN_ROLE) {
        if (fundWeight.treasury + fundWeight.insurance + fundWeight.vault != Config.FUND_WEIGHT_BASE)
            revert InvalidFundWeight(fundWeight);
        ProtocolParamsStorage.layout().fundWeight = fundWeight;
        emit SetFundWeight(fundWeight);
    }

    /* ============ External View Functions ============ */

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getTreasuryAddr() external view override returns (address) {
        return ProtocolParamsStorage.layout().getTreasuryAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getInsuranceAddr() external view override returns (address) {
        return ProtocolParamsStorage.layout().getInsuranceAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getVaultAddr() external view override returns (address) {
        return ProtocolParamsStorage.layout().getVaultAddr();
    }

    /**
     * @inheritdoc IProtocolParamsFacet
     */
    function getFundWeight() external view override returns (FundWeight memory) {
        return ProtocolParamsStorage.layout().getFundWeight();
    }
}
