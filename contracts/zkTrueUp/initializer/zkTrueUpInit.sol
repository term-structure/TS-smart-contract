// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {SafeOwnable} from "@solidstate/contracts/access/ownable/SafeOwnable.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {FlashLoanStorage} from "../flashLoan/FlashLoanStorage.sol";
import {ProtocolParamsStorage, FundWeight} from "../protocolParams/ProtocolParamsStorage.sol";
import {LoanStorage, LiquidationFactor} from "../loan/LoanStorage.sol";
import {RollupStorage, StoredBlock} from "../rollup/RollupStorage.sol";
import {TokenStorage, AssetConfig} from "../token/TokenStorage.sol";
import {TokenLib} from "../token/TokenLib.sol";
import {Config, InitConfig} from "../libraries/Config.sol";

/**
 * @title Zk-TureUp Initializer Contract
 * @notice This contract is used to initialize the zkTrueUp protocol
 */
contract ZkTrueUpInit is SafeOwnable, AccessControlInternal {
    function init(bytes calldata data) external {
        (
            address wETHAddr,
            address poseidonUnit2Addr,
            address verifierAddr,
            address evacuVerifierAddr,
            address adminAddr,
            address operatorAddr,
            address treasuryAddr,
            address insuranceAddr,
            address vaultAddr,
            bytes32 genesisStateRoot,
            AssetConfig memory ethConfig
        ) = abi.decode(
                data,
                (address, address, address, address, address, address, address, address, address, bytes32, AssetConfig)
            );

        // set roles
        AccessControlInternal._setRoleAdmin(Config.ADMIN_ROLE, Config.ADMIN_ROLE);
        _transferOwnership(adminAddr);
        AccessControlInternal._grantRole(Config.ADMIN_ROLE, adminAddr);
        AccessControlInternal._grantRole(Config.OPERATOR_ROLE, operatorAddr);
        AccessControlInternal._grantRole(Config.COMMITTER_ROLE, operatorAddr);
        AccessControlInternal._grantRole(Config.VERIFIER_ROLE, operatorAddr);
        AccessControlInternal._grantRole(Config.EXECUTER_ROLE, operatorAddr);

        // init account facet
        AccountStorage.Layout storage asl = AccountStorage.layout();
        asl.accountNum = Config.NUM_RESERVED_ACCOUNTS;

        // init address facet
        AddressStorage.Layout storage addrsl = AddressStorage.layout();
        addrsl.wETHAddr = wETHAddr;
        addrsl.poseidonUnit2Addr = poseidonUnit2Addr;
        addrsl.verifierAddr = verifierAddr;
        addrsl.evacuVerifierAddr = evacuVerifierAddr;

        // init flashLoan facet
        FlashLoanStorage.Layout storage flsl = FlashLoanStorage.layout();
        flsl.flashLoanPremium = InitConfig.INIT_FLASH_LOAN_PREMIUM;

        // init protocolParams facet
        ProtocolParamsStorage.Layout storage ppsl = ProtocolParamsStorage.layout();
        ppsl.treasuryAddr = treasuryAddr;
        ppsl.insuranceAddr = insuranceAddr;
        ppsl.vaultAddr = vaultAddr;
        FundWeight memory fundWeight = FundWeight({
            treasury: InitConfig.INIT_TREASURY_WEIGHT,
            insurance: InitConfig.INIT_INSURANCE_WEIGHT,
            vault: InitConfig.INIT_VAULT_WEIGHT
        });
        ppsl.fundWeight = fundWeight;

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

        // init rollup facet
        RollupStorage.Layout storage rsl = RollupStorage.layout();
        StoredBlock memory genesisBlock = StoredBlock({
            blockNumber: 0,
            l1RequestNum: 0,
            pendingRollupTxHash: Config.EMPTY_STRING_KECCAK,
            commitment: bytes32(0),
            stateRoot: genesisStateRoot,
            timestamp: 0
        });
        rsl.storedBlockHashes[0] = keccak256(abi.encode(genesisBlock));

        // init token facet
        TokenStorage.Layout storage tsl = TokenStorage.layout();
        uint16 newTokenId = TokenLib.getTokenNum() + 1;
        tsl.tokenNum = newTokenId;
        tsl.tokenIds[Config.ETH_ADDRESS] = newTokenId;
        tsl.assetConfigs[newTokenId] = AssetConfig({
            isStableCoin: ethConfig.isStableCoin,
            isTsbToken: ethConfig.isTsbToken,
            decimals: ethConfig.decimals,
            minDepositAmt: ethConfig.minDepositAmt,
            tokenAddr: Config.ETH_ADDRESS,
            priceFeed: ethConfig.priceFeed
        });
    }
}
