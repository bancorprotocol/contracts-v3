// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { SafeERC20Ex } from "./SafeERC20Ex.sol";

type ReserveToken is address;

/**
 * @dev This library implements ERC20 and SafeERC20 utilities for reserve tokens, which can be either ERC20 tokens or ETH
 */
library ReserveTokenLibrary {
    using SafeERC20 for IERC20;
    using SafeERC20Ex for IERC20;

    // the address that represents the native token reserve
    address public constant NATIVE_TOKEN_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    // the symbol that represents the native token
    string private constant NATIVE_TOKEN_SYMBOL = "ETH";

    // the decimals for the native token
    uint8 private constant NATIVE_TOKEN_DECIMALS = 18;

    /**
     * @dev returns whether the provided token represents an ERC20 or ETH reserve
     */
    function isNativeToken(ReserveToken reserveToken) internal pure returns (bool) {
        return ReserveToken.unwrap(reserveToken) == NATIVE_TOKEN_ADDRESS;
    }

    /**
     * @dev returns the symbol of the reserve token
     */
    function symbol(ReserveToken reserveToken) internal view returns (string memory) {
        if (isNativeToken(reserveToken)) {
            return NATIVE_TOKEN_SYMBOL;
        }

        return toERC20(reserveToken).symbol();
    }

    /**
     * @dev returns the decimals of the reserve token
     */
    function decimals(ReserveToken reserveToken) internal view returns (uint8) {
        if (isNativeToken(reserveToken)) {
            return NATIVE_TOKEN_DECIMALS;
        }

        return toERC20(reserveToken).decimals();
    }

    /**
     * @dev returns the balance of the reserve token
     */
    function balanceOf(ReserveToken reserveToken, address account) internal view returns (uint256) {
        if (isNativeToken(reserveToken)) {
            return account.balance;
        }

        return toIERC20(reserveToken).balanceOf(account);
    }

    /**
     * @dev transfers a specific amount of the reserve token
     */
    function safeTransfer(
        ReserveToken reserveToken,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0) {
            return;
        }

        if (isNativeToken(reserveToken)) {
            payable(to).transfer(amount);
        } else {
            toIERC20(reserveToken).safeTransfer(to, amount);
        }
    }

    /**
     * @dev transfers a specific amount of the reserve token from a specific holder using the allowance mechanism
     *
     * note that the function ignores a reserve token which represents an ETH reserve
     */
    function safeTransferFrom(
        ReserveToken reserveToken,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0 || isNativeToken(reserveToken)) {
            return;
        }

        toIERC20(reserveToken).safeTransferFrom(from, to, amount);
    }

    /**
     * @dev ensures that the spender has sufficient allowance
     *
     * note that this function ignores a reserve token which represents an ETH reserve
     */
    function ensureApprove(
        ReserveToken reserveToken,
        address spender,
        uint256 amount
    ) internal {
        if (isNativeToken(reserveToken)) {
            return;
        }

        toIERC20(reserveToken).ensureApprove(spender, amount);
    }

    /**
     * @dev utility function that converts an ReserveToken to an IERC20
     */
    function toIERC20(ReserveToken reserveToken) internal pure returns (IERC20) {
        return IERC20(ReserveToken.unwrap(reserveToken));
    }

    /**
     * @dev utility function that converts an ReserveToken to an ERC20
     */
    function toERC20(ReserveToken reserveToken) internal pure returns (ERC20) {
        return ERC20(ReserveToken.unwrap(reserveToken));
    }
}
