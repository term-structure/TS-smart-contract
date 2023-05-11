// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {SafeOwnable} from "@solidstate/contracts/access/ownable/SafeOwnable.sol";
import {GovernanceStorage, FundWeight} from "../governance/GovernanceStorage.sol";
import {LoanStorage, LiquidationFactor} from "../loan/LoanStorage.sol";
import {Config, InitConfig} from "../libraries/Config.sol";

import "hardhat/console.sol";

contract ZkTrueUpInit is SafeOwnable, AccessControlInternal {
    using GovernanceStorage for GovernanceStorage.Layout;
    using LoanStorage for LoanStorage.Layout;

    function init(bytes calldata data) external {
        (address adminAddr, address operatorAddr, address treasuryAddr, address insuranceAddr, address vaultAddr) = abi
            .decode(data, (address, address, address, address, address));
        // set roles
        AccessControlInternal._setRoleAdmin(Config.ADMIN_ROLE, Config.ADMIN_ROLE);
        _transferOwnership(adminAddr);
        AccessControlInternal._grantRole(Config.ADMIN_ROLE, adminAddr);
        AccessControlInternal._grantRole(Config.OPERATOR_ROLE, operatorAddr);

        // init governance facet
        GovernanceStorage.Layout storage gsl = GovernanceStorage.layout();
        gsl.treasuryAddr = treasuryAddr;
        gsl.insuranceAddr = insuranceAddr;
        gsl.vaultAddr = vaultAddr;
        FundWeight memory fundWeight = FundWeight({
            treasury: InitConfig.INIT_TREASURY_WEIGHT,
            insurance: InitConfig.INIT_INSURANCE_WEIGHT,
            vault: InitConfig.INIT_VAULT_WEIGHT
        });
        gsl.fundWeight = fundWeight;

        // init loan facet
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        lsl.halfLiquidationThreshold = InitConfig.INIT_HALF_LIQUIDATION_THRESHOLD;

        LiquidationFactor memory initLiquidationFactor = LiquidationFactor({
            ltvThreshold: InitConfig.INIT_LTV_THRESHOLD,
            liquidatorIncentive: InitConfig.INIT_LIQUIDATOR_INCENTIVE,
            protocolPenalty: InitConfig.INIT_PROTOCOL_PENALTY
        });
        lsl.liquidationFactor = initLiquidationFactor;

        LiquidationFactor memory initStableCoinPairLiquidationFactor = LiquidationFactor({
            ltvThreshold: InitConfig.INIT_STABLECOIN_PAIR_LTV_THRESHOLD,
            liquidatorIncentive: InitConfig.INIT_STABLECOIN_PAIR_LIQUIDATOR_INCENTIVE,
            protocolPenalty: InitConfig.INIT_STABLECOIN_PAIR_PROTOCOL_PENALTY
        });
        lsl.stableCoinPairLiquidationFactor = initStableCoinPairLiquidationFactor;
    }
}
