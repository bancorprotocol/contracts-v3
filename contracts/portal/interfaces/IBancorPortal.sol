// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";
import { Token } from "../../token/Token.sol";

struct PositionMigration {
    uint256 amountA;
    uint256 amountB;
}

interface IBancorPortal is IUpgradeable {
    /**
     * @dev migrates funds from a Uniswap v2 pair into a bancor v3 pool and returns the deposited amount for each token
     * in the same order as stored in Uniswap's pair, or 0 for unsupported tokens (unsupported tokens will be
     * transferred to the caller)
     *
     * requirements:
     *
     * - the caller must have approved the pair to transfer the liquidity on its behalf
     */
    function migrateUniswapV2Position(
        Token token0,
        Token token1,
        uint256 amount
    ) external returns (PositionMigration memory);

    /**
     * @dev migrates funds from a SushiSwap pair into a bancor v3 pool and returns the deposited amount for each token
     * in the same order as stored in Uniswap's pair, or 0 for unsupported tokens (unsupported tokens will be
     * transferred to the caller)
     *
     * requirements:
     *
     * - the caller must have approved the pair to transfer the liquidity on its behalf
     */
    function migrateSushiSwapPosition(
        Token token0,
        Token token1,
        uint256 amount
    ) external returns (PositionMigration memory);
}
