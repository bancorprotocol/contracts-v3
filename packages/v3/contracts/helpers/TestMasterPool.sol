// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/IBancorNetwork.sol";

import { IBancorVault } from "../vaults/interfaces/IBancorVault.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { WithdrawalAmounts } from "../pools/interfaces/IMasterPool.sol";
import { MasterPool } from "../pools/MasterPool.sol";

contract TestMasterPool is MasterPool {
    constructor(
        IBancorNetwork initNetwork,
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initNetworkSettings,
        IBancorVault initMasterVault,
        IPoolToken initMasterPoolToken
    )
        MasterPool(
            initNetwork,
            initNetworkTokenGovernance,
            initGovTokenGovernance,
            initNetworkSettings,
            initMasterVault,
            initMasterPoolToken
        )
    {}

    function withdrawalAmountsT(uint256 poolTokenAmount) external view returns (WithdrawalAmounts memory) {
        return _withdrawalAmounts(poolTokenAmount);
    }
}
