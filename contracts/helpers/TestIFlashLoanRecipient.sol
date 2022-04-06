// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { IBancorNetwork, IFlashLoanRecipient } from "../network/interfaces/IBancorNetwork.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TestFlashLoanRecipient is IFlashLoanRecipient {
    using Address for address payable;
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;

    struct CallbackData {
        address caller;
        IERC20 token;
        uint256 amount;
        uint256 feeAmount;
        bytes data;
        uint256 receivedAmount;
    }

    IBancorNetwork private immutable _network;
    mapping(IERC20 => uint256) private _snapshots;
    CallbackData private _callbackData;
    uint256 private _amountToReturn;
    bool private _reenter;

    constructor(IBancorNetwork network) {
        _network = network;
    }

    receive() external payable {}

    function snapshot(IERC20 token) external {
        _snapshots[token] = Token(address(token)).balanceOf(address(this));
    }

    function callbackData() external view returns (CallbackData memory) {
        return _callbackData;
    }

    function setAmountToReturn(uint256 amountToReturn) external {
        _amountToReturn = amountToReturn;
    }

    function setReenter(bool reenter) external {
        _reenter = reenter;
    }

    function onFlashLoan(
        address caller,
        IERC20 erc20Token,
        uint256 amount,
        uint256 feeAmount,
        bytes memory data
    ) external {
        Token token = Token(address(erc20Token));

        _callbackData = CallbackData({
            caller: caller,
            token: erc20Token,
            amount: amount,
            feeAmount: feeAmount,
            data: data,
            receivedAmount: token.balanceOf(address(this)) - _snapshots[erc20Token]
        });

        if (_reenter) {
            _network.flashLoan(token, amount, IFlashLoanRecipient(address(this)), new bytes(0));
        }

        uint256 returnAmount = _amountToReturn != 0 ? _amountToReturn : amount + feeAmount;
        if (token.isNative()) {
            payable(msg.sender).sendValue(returnAmount);
        } else {
            token.safeTransfer(msg.sender, returnAmount);
        }
    }
}
