// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../network/BancorNetwork.sol";

contract TestBancorNetwork is BancorNetwork {
    constructor(INetworkSettings initSettings) BancorNetwork(initSettings) {}

    function createPoolT(ILiquidityPoolCollection liquidityPoolCollection, IReserveToken reserveToken) external {
        liquidityPoolCollection.createPool(reserveToken);
    }
}
