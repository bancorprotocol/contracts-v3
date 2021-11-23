// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

contract TestReserveToken {
    using ReserveTokenLibrary for ReserveToken;

    receive() external payable {}

    function isNativeToken(ReserveToken reserveToken) external pure returns (bool) {
        return reserveToken.isNativeToken();
    }

    function symbol(ReserveToken reserveToken) external view returns (string memory) {
        return reserveToken.symbol();
    }

    function decimals(ReserveToken reserveToken) external view returns (uint8) {
        return reserveToken.decimals();
    }

    function balanceOf(ReserveToken reserveToken, address account) external view returns (uint256) {
        return reserveToken.balanceOf(account);
    }

    function safeTransfer(
        ReserveToken reserveToken,
        address to,
        uint256 amount
    ) external {
        reserveToken.safeTransfer(to, amount);
    }

    function safeTransferFrom(
        ReserveToken reserveToken,
        address from,
        address to,
        uint256 amount
    ) external {
        reserveToken.safeTransferFrom(from, to, amount);
    }

    function ensureApprove(
        ReserveToken reserveToken,
        address spender,
        uint256 amount
    ) external {
        reserveToken.ensureApprove(spender, amount);
    }
}
