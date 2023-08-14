// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

/**
 * @dev mock carbon POL contract to receive pool surplus tokens
 */
contract MockCarbonPOL {
    constructor() {}

    /**
     * @dev authorize the contract to receive the native token
     */
    receive() external payable {}
}
