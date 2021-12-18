// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/IBancorNetwork.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { WithdrawalAmounts } from "../pools/interfaces/IMasterPool.sol";
import { MasterPool } from "../pools/MasterPool.sol";

contract TestMasterPool is MasterPool {
    constructor(
        IBancorNetwork initNetwork,
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
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

    function mintT(address recipient, uint256 poolTokenAmount) external {
        return _poolToken.mint(recipient, poolTokenAmount);
    }

    function burnT(uint256 poolTokenAmount) external {
        return _poolToken.burn(poolTokenAmount);
    }
}
