// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

contract TestTokenLibrary {
    using TokenLibrary for Token;

    receive() external payable {}

    function isNative(Token token) external pure returns (bool) {
        return token.isNative();
    }

    function symbol(Token token) external view returns (string memory) {
        return token.symbol();
    }

    function decimals(Token token) external view returns (uint8) {
        return token.decimals();
    }

    function balanceOf(Token token, address account) external view returns (uint256) {
        return token.balanceOf(account);
    }

    function safeTransfer(
        Token token,
        address to,
        uint256 amount
    ) external {
        token.safeTransfer(to, amount);
    }

    function safeTransferFrom(
        Token token,
        address from,
        address to,
        uint256 amount
    ) external {
        token.safeTransferFrom(from, to, amount);
    }

    function safeApprove(
        Token token,
        address spender,
        uint256 amount
    ) external {
        token.safeApprove(spender, amount);
    }

    function ensureApprove(
        Token token,
        address spender,
        uint256 amount
    ) external {
        token.ensureApprove(spender, amount);
    }

    function isEqual(Token token, IERC20 erc20Token) external pure returns (bool) {
        return token.isEqual(erc20Token);
    }
}
