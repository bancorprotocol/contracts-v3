// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { TestPoolCollection } from "./TestPoolCollection.sol";

contract TestPoolCollectionUnknownVersion is TestPoolCollection {
    constructor(IBancorNetwork initNetwork) TestPoolCollection(initNetwork) {}

    function version() external pure override returns (uint16) {
        return 1000;
    }
}
