// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { ITokenHolder } from "./interfaces/ITokenHolder.sol";

import { IVersioned } from "./interfaces/IVersioned.sol";
import { Owned } from "./Owned.sol";
import { Utils } from "./Utils.sol";
import { uncheckedInc } from "./MathEx.sol";

error InvalidLength();

/**
 * @dev this contract provides an owned token and ETH wallet
 */
contract TokenHolder is IVersioned, ITokenHolder, Owned, Utils {
    using ReserveTokenLibrary for ReserveToken;

    receive() external payable virtual {}

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc ITokenHolder
     */
    function withdrawTokens(
        ReserveToken reserveToken,
        address payable to,
        uint256 amount
    ) external virtual onlyOwner validAddress(to) {
        reserveToken.safeTransfer(to, amount);
    }

    /**
     * @inheritdoc ITokenHolder
     */
    function withdrawTokensMultiple(
        ReserveToken[] calldata reserveTokens,
        address payable to,
        uint256[] calldata amounts
    ) external virtual onlyOwner validAddress(to) {
        uint256 length = reserveTokens.length;
        if (length != amounts.length) {
            revert InvalidLength();
        }

        for (uint256 i = 0; i < length; i = uncheckedInc(i)) {
            reserveTokens[i].safeTransfer(to, amounts[i]);
        }
    }
}
