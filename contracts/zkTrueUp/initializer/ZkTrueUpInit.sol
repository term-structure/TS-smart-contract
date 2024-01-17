// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Initializable} from "@solidstate/contracts/security/initializable/Initializable.sol";
import {AccessControlInternal} from "@solidstate/contracts/access/access_control/AccessControlInternal.sol";
import {Ownable} from "@solidstate/contracts/access/ownable/Ownable.sol";
import {AccountStorage} from "../account/AccountStorage.sol";
import {AddressStorage} from "../address/AddressStorage.sol";
import {FlashLoanStorage} from "../flashLoan/FlashLoanStorage.sol";
import {ProtocolParamsStorage, FundWeight} from "../protocolParams/ProtocolParamsStorage.sol";
import {LoanStorage, LiquidationFactor} from "../loan/LoanStorage.sol";
import {RollupStorage, StoredBlock} from "../rollup/RollupStorage.sol";
import {TokenStorage, AssetConfig} from "../token/TokenStorage.sol";
import {IWETH} from "../interfaces/IWETH.sol";
import {IPoseidonUnit2} from "../interfaces/IPoseidonUnit2.sol";
import {IVerifier} from "../interfaces/IVerifier.sol";
import {IPool} from "../interfaces/aaveV3/IPool.sol";
import {Config} from "../libraries/Config.sol";
import {InitialConfig} from "../libraries/InitialConfig.sol";
import {Utils} from "../libraries/Utils.sol";

/**
 * @title Zk-TureUp Initializer Contract
 * @author Term Structure Labs
 * @notice This contract is used to initialize the Term Structure Protocol
 */
contract ZkTrueUpInit is Ownable, Initializable, AccessControlInternal {
    using Utils for *;

    /**
     * @notice Initialize function for the Term Structure Protocol
     * @dev This function is called only once when the protocol is deployed
     * @param data The encoded data for the initializer
     */
    function init(bytes calldata data) external initializer {
        (
            address wETHAddr,
            address poseidonUnit2Addr,
            address verifierAddr,
            address evacuVerifierAddr,
            address adminAddr,
            address operatorAddr,
            address payable treasuryAddr,
            address payable insuranceAddr,
            address payable vaultAddr,
            bytes32 genesisStateRoot,
            AssetConfig memory ethConfig
        ) = abi.decode(
                data,
                (address, address, address, address, address, address, address, address, address, bytes32, AssetConfig)
            );

        // check address of initial parameters are not zero address
        wETHAddr.notZeroAddr();
        poseidonUnit2Addr.notZeroAddr();
        verifierAddr.notZeroAddr();
        evacuVerifierAddr.notZeroAddr();
        adminAddr.notZeroAddr();
        operatorAddr.notZeroAddr();
        treasuryAddr.notZeroAddr();
        insuranceAddr.notZeroAddr();
        vaultAddr.notZeroAddr();

        // set roles
        _setRoleAdmin(Config.ADMIN_ROLE, Config.ADMIN_ROLE);
        _grantRole(Config.ADMIN_ROLE, adminAddr);
        _grantRole(Config.OPERATOR_ROLE, operatorAddr);
        _grantRole(Config.COMMITTER_ROLE, operatorAddr);
        _grantRole(Config.VERIFIER_ROLE, operatorAddr);
        _grantRole(Config.EXECUTER_ROLE, operatorAddr);
        transferOwnership(adminAddr);

        // init account facet
        AccountStorage.Layout storage asl = AccountStorage.layout();
        asl.accountNum = Config.NUM_RESERVED_ACCOUNTS;

        // init address facet
        AddressStorage.Layout storage addrsl = AddressStorage.layout();
        addrsl.wETH = IWETH(wETHAddr);
        addrsl.poseidonUnit2 = IPoseidonUnit2(poseidonUnit2Addr);
        addrsl.verifier = IVerifier(verifierAddr);
        addrsl.evacuVerifier = IVerifier(evacuVerifierAddr);

        Config.AAVE_V3_POOL_ADDRESS.notZeroAddr();
        addrsl.aaveV3Pool = IPool(Config.AAVE_V3_POOL_ADDRESS);

        // init flashLoan facet
        FlashLoanStorage.Layout storage flsl = FlashLoanStorage.layout();
        flsl.flashLoanPremium = InitialConfig.INIT_FLASH_LOAN_PREMIUM;

        // init protocolParams facet
        ProtocolParamsStorage.Layout storage ppsl = ProtocolParamsStorage.layout();
        ppsl.treasuryAddr = treasuryAddr;
        ppsl.insuranceAddr = insuranceAddr;
        ppsl.vaultAddr = vaultAddr;
        FundWeight memory fundWeight = FundWeight({
            treasury: InitialConfig.INIT_TREASURY_WEIGHT,
            insurance: InitialConfig.INIT_INSURANCE_WEIGHT,
            vault: InitialConfig.INIT_VAULT_WEIGHT
        });
        ppsl.fundWeight = fundWeight;

        // init loan facet
        LoanStorage.Layout storage lsl = LoanStorage.layout();
        lsl.halfLiquidationThreshold = InitialConfig.INIT_HALF_LIQUIDATION_THRESHOLD;
        lsl.borrowFeeRate = InitialConfig.INIT_BORROWER_FEE_RATE;
        lsl.rollOverFee = InitialConfig.INIT_ROLL_OVER_FEE;

        LiquidationFactor memory initLiquidationFactor = LiquidationFactor({
            liquidationLtvThreshold: InitialConfig.INIT_LIQUIDATION_LTV_THRESHOLD,
            borrowOrderLtvThreshold: InitialConfig.INIT_BORROW_ORDER_LTV_THRESHOLD,
            liquidatorIncentive: InitialConfig.INIT_LIQUIDATOR_INCENTIVE,
            protocolPenalty: InitialConfig.INIT_PROTOCOL_PENALTY
        });
        lsl.liquidationFactor = initLiquidationFactor;

        LiquidationFactor memory initStableCoinPairLiquidationFactor = LiquidationFactor({
            liquidationLtvThreshold: InitialConfig.INIT_STABLECOIN_PAIR_LIQUIDATION_LTV_THRESHOLD,
            borrowOrderLtvThreshold: InitialConfig.INIT_STABLECOIN_PAIR_BORROW_ORDER_LTV_THRESHOLD,
            liquidatorIncentive: InitialConfig.INIT_STABLECOIN_PAIR_LIQUIDATOR_INCENTIVE,
            protocolPenalty: InitialConfig.INIT_STABLECOIN_PAIR_PROTOCOL_PENALTY
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
        // The first token Id is start from 1 in init
        uint16 newTokenId = tsl.tokenNum + 1;
        tsl.tokenNum = newTokenId;
        IERC20 defaultEthToken = IERC20(Config.ETH_ADDRESS);
        tsl.tokenIds[defaultEthToken] = newTokenId;
        tsl.assetConfigs[newTokenId] = AssetConfig({
            isStableCoin: ethConfig.isStableCoin,
            isTsbToken: ethConfig.isTsbToken,
            decimals: ethConfig.decimals,
            minDepositAmt: ethConfig.minDepositAmt,
            token: defaultEthToken,
            priceFeed: ethConfig.priceFeed
        });
    }
}
