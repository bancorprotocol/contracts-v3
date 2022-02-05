// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";
import { INetworkSettings } from "../../network/interfaces/INetworkSettings.sol";
import { IUniswapV2Pair } from "../../bancor-portal/interfaces/IUniswapV2Pair.sol";

interface IBancorPortal is IUpgradeable {
    /**
     * @dev returns the program data of a pool
     */
    function migrateUniswapV2Position(IUniswapV2Pair pair, uint256 amount) external;
}
