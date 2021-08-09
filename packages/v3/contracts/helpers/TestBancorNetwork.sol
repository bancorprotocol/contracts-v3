// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/0.7.6/contracts/TokenGovernance.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { BancorNetwork } from "../network/BancorNetwork.sol";

import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

contract TestBancorNetwork is BancorNetwork {
    constructor(
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initSettings
    ) BancorNetwork(initNetworkTokenGovernance, initGovTokenGovernance, initSettings) {}

    function createPoolT(IPoolCollection liquidityPoolCollection, IReserveToken reserveToken) external {
        liquidityPoolCollection.createPool(reserveToken);
    }
}
