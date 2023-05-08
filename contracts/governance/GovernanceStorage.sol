// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

library GovernanceStorage {
    bytes32 internal constant STORAGE_SLOT = bytes32(uint256(keccak256("zkTureUp.contracts.storage.Governance")) - 1);
    using GovernanceStorage for GovernanceStorage.Layout;

    function setTreasuryAddr(Layout storage l, address treasuryAddr) internal {
        l.treasuryAddr = treasuryAddr;
    }

    function setInsuranceAddr(Layout storage l, address insuranceAddr) internal {
        l.insuranceAddr = insuranceAddr;
    }

    function setVaultAddr(Layout storage l, address vaultAddr) internal {
        l.vaultAddr = vaultAddr;
    }

    function setFundWeight(Layout storage l, FundWeight memory fundWeight) internal {
        l.fundWeight = fundWeight;
    }

    function getTreasuryAddr(Layout storage l) internal view returns (address) {
        return l.treasuryAddr;
    }

    function getInsuranceAddr(Layout storage l) internal view returns (address) {
        return l.insuranceAddr;
    }

    function getVaultAddr(Layout storage l) internal view returns (address) {
        return l.vaultAddr;
    }

    function getFundWeight(Layout storage l) internal view returns (FundWeight memory) {
        return l.fundWeight;
    }

    /// @notice The fund distribution weight of the protocol
    struct FundWeight {
        uint16 treasury;
        uint16 insurance;
        uint16 vault;
    }

    struct Layout {
        /// @notice Address of the treasury
        address treasuryAddr;
        /// @notice Address of the insurance
        address insuranceAddr;
        /// @notice Address of the vault
        address vaultAddr;
        /// @notice Fund weight for treasury, insurance and vault
        FundWeight fundWeight;
    }

    function layout() internal pure returns (Layout storage l) {
        bytes32 slot = STORAGE_SLOT;
        assembly {
            l.slot := slot
        }
    }
}
