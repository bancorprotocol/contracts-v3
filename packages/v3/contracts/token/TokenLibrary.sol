// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { SafeERC20Ex } from "./SafeERC20Ex.sol";

import { Token } from "./Token.sol";

/**
 * @dev This library implements ERC20 and SafeERC20 utilities for ETH/ERC20 tokens, which can be either ERC20 tokens
 * or ETH
 */
library TokenLibrary {
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
    function isNativeToken(Token token) internal pure returns (bool) {
        return address(token) == NATIVE_TOKEN_ADDRESS;
    }

    /**
     * @dev returns the symbol of the ETH/ERC20 token
     */
    function symbol(Token token) internal view returns (string memory) {
        if (isNativeToken(token)) {
            return NATIVE_TOKEN_SYMBOL;
        }

        return toERC20(token).symbol();
    }

    /**
     * @dev returns the decimals of the ETH/ERC20 token
     */
    function decimals(Token token) internal view returns (uint8) {
        if (isNativeToken(token)) {
            return NATIVE_TOKEN_DECIMALS;
        }

        return toERC20(token).decimals();
    }

    /**
     * @dev returns the balance of the ETH/ERC20 token
     */
    function balanceOf(Token token, address account) internal view returns (uint256) {
        if (isNativeToken(token)) {
            return account.balance;
        }

        return toIERC20(token).balanceOf(account);
    }

    /**
     * @dev transfers a specific amount of the ETH/ERC20 token
     */
    function safeTransfer(
        Token token,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0) {
            return;
        }

        if (isNativeToken(token)) {
            payable(to).transfer(amount);
        } else {
            toIERC20(token).safeTransfer(to, amount);
        }
    }

    /**
     * @dev transfers a specific amount of the ETH/ERC20 token from a specific holder using the allowance mechanism
     *
     * note that the function ignores a ETH/ERC20 token which represents an ETH reserve
     */
    function safeTransferFrom(
        Token token,
        address from,
        address to,
        uint256 amount
    ) internal {
        if (amount == 0 || isNativeToken(token)) {
            return;
        }

        toIERC20(token).safeTransferFrom(from, to, amount);
    }

    /**
     * @dev ensures that the spender has sufficient allowance
     *
     * note that this function ignores a ETH/ERC20 token which represents an ETH reserve
     */
    function ensureApprove(
        Token token,
        address spender,
        uint256 amount
    ) internal {
        if (isNativeToken(token)) {
            return;
        }

        toIERC20(token).ensureApprove(spender, amount);
    }

    /**
     * @dev utility function that converts an token to an IERC20
     */
    function toIERC20(Token token) internal pure returns (IERC20) {
        return IERC20(address(token));
    }

    /**
     * @dev utility function that converts an token to an ERC20
     */
    function toERC20(Token token) internal pure returns (ERC20) {
        return ERC20(address(token));
    }
}