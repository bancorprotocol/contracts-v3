// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";
import { Token } from "../../token/Token.sol";

struct UniswapV2PositionMigration {
    uint256 amountA;
    uint256 amountB;
}

interface IBancorPortal is IUpgradeable {
    /**
     * @dev migrates funds from a Uniswap v2 pair into a bancor v3 pool
     * - unsupported tokens will be transferred to the caller.
     *
     * - returns the deposited amount for each token in the same order as stored in
     *   Uniswap's pair, 0 for unsupported tokens.
     *
     * requirements:
     *
     * - the caller must have approved the pair to transfer the liquidity on its behalf
     */
    function migrateUniswapV2Position(
        Token token0,
        Token token1,
        uint256 amount
    ) external returns (UniswapV2PositionMigration memory);

    /**
     * @dev migrates funds from a SushiSwap v1 pair into a bancor v3 pool
     * - unsupported tokens will be transferred to the caller.
     *
     * - returns the deposited amount for each token in the same order as stored in
     *   SushiSwap's pair, 0 for unsupported tokens.
     *
     * requirements:
     *
     * - the caller must have approved the pair to transfer the liquidity on its behalf
     */
    function migrateSushiSwapV1Position(
        Token token0,
        Token token1,
        uint256 amount
    ) external returns (UniswapV2PositionMigration memory);
}
