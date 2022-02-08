// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";
import { INetworkSettings } from "../../network/interfaces/INetworkSettings.sol";
import { IUniswapV2Pair } from "../../bancor-portal/interfaces/IUniswapV2Pair.sol";
import { Token } from "../../token/Token.sol";

interface IBancorPortal is IUpgradeable {
    /**
     * @dev migrates funds from a uniswap v2 pair into a bancor v3 pool
     * - unsupported tokens will be transferred to the caller.
     *
     * - returns the deposited amount for each token in the same order as stored in
     *   uniswaps's pair, 0 for unsupported tokens.
     *
     * requirements:
     *
     * - the caller must have approved the pair to transfer the liquidity on its behalf
     */
    function migrateUniswapV2Position(
        Token token0,
        Token token1,
        uint256 amount
    ) external returns (uint256 depositedAmountA, uint256 depositedAmountB);

    /**
     * @dev migrates funds from a sushiswap v1 pair into a bancor v3 pool
     * - unsupported tokens will be transferred to the caller.
     *
     * - returns the deposited amount for each token in the same order as stored in
     *   uniswaps's pair, 0 for unsupported tokens.
     *
     * requirements:
     *
     * - the caller must have approved the pair to transfer the liquidity on its behalf
     */
    function migrateSushiswapV1Position(
        Token token0,
        Token token1,
        uint256 amount
    ) external returns (uint256 depositedAmountA, uint256 depositedAmountB);
}
