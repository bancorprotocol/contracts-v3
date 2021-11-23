// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { IBancorNetwork, IFlashLoanRecipient } from "../network/interfaces/IBancorNetwork.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract TestFlashLoanRecipient is IFlashLoanRecipient {
    using Address for address payable;
    using SafeERC20 for IERC20;
    using ReserveTokenLibrary for ReserveToken;

    struct CallbackData {
        address sender;
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
        ReserveToken reserveToken = ReserveToken.wrap(address(token));

        _snapshots[token] = reserveToken.balanceOf(address(this));
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
        address sender,
        IERC20 token,
        uint256 amount,
        uint256 feeAmount,
        bytes memory data
    ) external {
        ReserveToken reserveToken = ReserveToken.wrap(address(token));

        _callbackData = CallbackData({
            sender: sender,
            token: token,
            amount: amount,
            feeAmount: feeAmount,
            data: data,
            receivedAmount: reserveToken.balanceOf(address(this)) - _snapshots[token]
        });

        if (_reenter) {
            _network.flashLoan(reserveToken, amount, IFlashLoanRecipient(address(this)), new bytes(0));
        }

        uint256 returnAmount = _amountToReturn != 0 ? _amountToReturn : amount + feeAmount;
        if (reserveToken.isNativeToken()) {
            payable(msg.sender).sendValue(returnAmount);
        } else {
            reserveToken.safeTransfer(msg.sender, returnAmount);
        }
    }
}
