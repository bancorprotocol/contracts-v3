// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { ITokenHolder } from "./interfaces/ITokenHolder.sol";

import { IVersioned } from "./interfaces/IVersioned.sol";
import { Owned } from "./Owned.sol";
import { Utils } from "./Utils.sol";
import { uncheckedInc } from "./MathEx.sol";

/**
 * @dev this contract provides an owned token and ETH wallet
 */
contract TokenHolder is IVersioned, ITokenHolder, Owned, Utils {
    using ReserveTokenLibrary for ReserveToken;

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
        ReserveToken reserveToken,
        address payable to,
        uint256 amount
    ) external virtual override onlyOwner validAddress(to) {
        reserveToken.safeTransfer(to, amount);
    }

    /**
     * @inheritdoc ITokenHolder
     */
    function withdrawTokensMultiple(
        ReserveToken[] calldata reserveTokens,
        address payable to,
        uint256[] calldata amounts
    ) external virtual override onlyOwner validAddress(to) {
        uint256 length = reserveTokens.length;
        require(length == amounts.length, "ERR_INVALID_LENGTH");

        for (uint256 i = 0; i < length; i = uncheckedInc(i)) {
            reserveTokens[i].safeTransfer(to, amounts[i]);
        }
    }
}
