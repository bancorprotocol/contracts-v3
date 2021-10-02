// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";
import { ReserveToken } from "../token/ReserveToken.sol";

import { ITokenHolder } from "./interfaces/ITokenHolder.sol";

import { IVersioned } from "./interfaces/IVersioned.sol";
import { Owned } from "./Owned.sol";
import { Utils } from "./Utils.sol";

/**
 * @dev this contract provides an owned token and ETH wallet
 */
contract TokenHolder is IVersioned, ITokenHolder, Owned, Utils {
    using ReserveToken for IReserveToken;

    receive() external payable virtual override {}

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc ITokenHolder
     */
    function withdrawTokens(
        IReserveToken reserveToken,
        address payable to,
        uint256 amount
    ) external virtual override onlyOwner validAddress(to) {
        reserveToken.safeTransfer(to, amount);
    }

    /**
     * @inheritdoc ITokenHolder
     */
    function withdrawTokensMultiple(
        IReserveToken[] calldata reserveTokens,
        address payable to,
        uint256[] calldata amounts
    ) external virtual override onlyOwner validAddress(to) {
        uint256 length = reserveTokens.length;
        require(length == amounts.length, "ERR_INVALID_LENGTH");

        for (uint256 i = 0; i < length; i++) {
            reserveTokens[i].safeTransfer(to, amounts[i]);
        }
    }
}
