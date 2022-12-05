// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IBancorNetwork, IFlashLoanRecipient } from "../network/interfaces/IBancorNetwork.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";
import { Token } from "../token/Token.sol";

contract Arbitrage is IFlashLoanRecipient {
    using SafeERC20 for IERC20;
    using Address for address payable;
    using TokenLibrary for Token;

    IBancorNetwork immutable private _bancorNetwork;
    Token immutable private _bnt;

    constructor(IBancorNetwork bancorNetwork, Token bnt) {
        _bancorNetwork = bancorNetwork;
        _bnt = bnt;
    }

    function arbitrage(uint256 bntAmount) external {
        _bancorNetwork.flashLoan(_bnt, bntAmount, this, "0x");
    }

    function onFlashLoan(
        address /*caller*/,
        IERC20 erc20Token,
        uint256 amount,
        uint256 feeAmount,
        bytes memory /*data*/
    ) external override(IFlashLoanRecipient) {
        Token token = Token(address(erc20Token));
        uint256 returnAmount = amount + feeAmount;
        if (token.isNative()) {
            payable(msg.sender).sendValue(returnAmount);
        } else {
            token.safeTransfer(msg.sender, returnAmount);
        }
    }
}