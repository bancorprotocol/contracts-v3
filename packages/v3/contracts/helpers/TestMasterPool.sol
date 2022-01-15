// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/IBancorNetwork.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
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

    function mintPoolTokenT(address recipient, uint256 poolTokenAmount) external {
        return _poolToken.mint(recipient, poolTokenAmount);
    }

    function burnPoolTokenT(uint256 poolTokenAmount) external {
        return _poolToken.burn(poolTokenAmount);
    }
}
