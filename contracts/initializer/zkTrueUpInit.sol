// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {GovernanceStorage} from "../governance/GovernanceStorage.sol";
import {LoanStorage} from "../loan/LoanStorage.sol";
import {Config, InitConfig} from "../libs/Config.sol";

import "hardhat/console.sol";

contract ZkTrueUpInit is AccessControlInternal {
    using GovernanceStorage for GovernanceStorage.Layout;
    using LoanStorage for LoanStorage.Layout;

    function init(bytes calldata data) external {
        (address adminAddr, address operatorAddr, address treasuryAddr, address insuranceAddr, address vaultAddr) = abi
            .decode(data, (address, address, address, address, address));
        // set roles
        AccessControlInternal._setRoleAdmin(Config.ADMIN_ROLE, Config.ADMIN_ROLE);
        AccessControlInternal._grantRole(Config.ADMIN_ROLE, adminAddr);
        AccessControlInternal._grantRole(Config.OPERATOR_ROLE, operatorAddr);

        // init governance facet
        GovernanceStorage.Layout storage gsl = GovernanceStorage.layout();
        gsl.setTreasuryAddr(treasuryAddr);
        gsl.setInsuranceAddr(insuranceAddr);
        gsl.setVaultAddr(vaultAddr);

        // init loan facet
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        lsl.setHalfLiquidationThreshold(InitConfig.INIT_HALF_LIQUIDATION_THRESHOLD);
        lsl.setFlashLoanPremium(InitConfig.INIT_FLASH_LOAN_PREMIUM);
    }
}
