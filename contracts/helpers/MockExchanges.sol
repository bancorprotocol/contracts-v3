// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ISwapRouter } from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

contract MockExchanges {
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;

    // the address that represents the native token reserve
    address private constant NATIVE_TOKEN_ADDRESS = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    IERC20 private immutable _weth;

    constructor(IERC20 weth) {
        _weth = weth;
    }

    receive() external payable {}

    //solhint-disable-next-line func-name-mixedcase
    function WETH() external view returns (IERC20) {
        return _weth;
    }

    /**
     * Bancor v2 trade
     */
    function convertByPath(
        address[] memory _path,
        uint256 _amount,
        uint256 _minReturn,
        address /* _beneficiary */,
        address /* _affiliateAccount */,
        uint256 /* _affiliateFee */
    ) external payable returns (uint256) {
        Token sourceToken = Token(_path[0]);
        Token targetToken = Token(_path[_path.length - 1]);
        return mockSwap(sourceToken, targetToken, _amount, msg.sender, block.timestamp, _minReturn);
    }

    /**
     * Bancor v3 trade
     */
    function tradeBySourceAmount(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address /* beneficiary */
    ) external payable returns (uint256) {
        return mockSwap(sourceToken, targetToken, sourceAmount, msg.sender, deadline, minReturnAmount);
    }

    /**
     * Uniswap v2 + Sushiswap trades
     */
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address /* to */,
        uint deadline
    ) external returns (uint[] memory) {
        uint[] memory amounts = new uint[](2);
        amounts[0] = amountIn;
        amounts[1] = mockSwap(Token(path[0]), Token(path[1]), amountIn, msg.sender, deadline, amountOutMin);
        return amounts;
    }

    function swapExactETHForTokens(
        uint amountOutMin,
        address[] calldata path,
        address /* to */,
        uint deadline
    ) external payable returns (uint[] memory) {
        uint[] memory amounts = new uint[](2);
        amounts[0] = msg.value;
        amounts[1] = mockSwap(
            Token(NATIVE_TOKEN_ADDRESS),
            Token(path[1]),
            msg.value,
            msg.sender,
            deadline,
            amountOutMin
        );
        return amounts;
    }

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address /* to */,
        uint deadline
    ) external returns (uint[] memory) {
        uint[] memory amounts = new uint[](2);
        amounts[0] = amountIn;
        amounts[1] = mockSwap(
            Token(path[0]),
            Token(NATIVE_TOKEN_ADDRESS),
            amountIn,
            msg.sender,
            deadline,
            amountOutMin
        );
        return amounts;
    }

    /**
     * Uniswap v3 trade
     */
    function exactInputSingle(ISwapRouter.ExactInputSingleParams memory params) external returns (uint256 amountOut) {
        return
            mockSwap(
                Token(params.tokenIn),
                Token(params.tokenOut),
                params.amountIn,
                msg.sender,
                params.deadline,
                params.amountOutMinimum
            );
    }

    function mockSwap(
        Token sourceToken,
        Token targetToken,
        uint256 amount,
        address trader,
        uint deadline,
        uint minTargetAmount
    ) public payable returns (uint256) {
        require(deadline >= block.timestamp, "Swap timeout");
        // withdraw source amount
        sourceToken.safeTransferFrom(trader, address(this), amount);

        // transfer target amount
        // receive 300 tokens per swap
        uint256 targetAmount = amount + 300e18;
        require(targetAmount >= minTargetAmount, "InsufficientTargetAmount");
        if(address(targetToken) == NATIVE_TOKEN_ADDRESS) {
            (bool sent, ) = trader.call{value: targetAmount}("");
            require(sent, "Error sending ETH to trader");
        } else {
            targetToken.safeTransfer(trader, targetAmount);
        }
        return targetAmount;
    }
}