// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { SafeERC20Ex } from "../token/SafeERC20Ex.sol";

contract TestSafeERC20Ex {
    using SafeERC20Ex for IERC20;

    function ensureApprove(IERC20 token, address spender, uint256 amount) external {
        token.ensureApprove(spender, amount);
    }
}
