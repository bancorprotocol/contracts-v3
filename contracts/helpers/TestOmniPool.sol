// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/IBancorNetwork.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { OmniPool } from "../pools/OmniPool.sol";

contract TestOmniPool is OmniPool {
    constructor(
        IBancorNetwork initNetwork,
        ITokenGovernance initBNTGovernance,
        ITokenGovernance initVBNTGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IPoolToken initOmniPoolToken
    )
        OmniPool(
            initNetwork,
            initBNTGovernance,
            initVBNTGovernance,
            initNetworkSettings,
            initMasterVault,
            initOmniPoolToken
        )
    {}

    function mintPoolTokenT(address recipient, uint256 poolTokenAmount) external {
        return _poolToken.mint(recipient, poolTokenAmount);
    }

    function burnPoolTokenT(uint256 poolTokenAmount) external {
        return _poolToken.burn(poolTokenAmount);
    }
}
