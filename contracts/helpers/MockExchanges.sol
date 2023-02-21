// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import { ISwapRouter } from "@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol";
import { MockUniswapV2Pair } from "./MockUniswapV2Pair.sol";

import "hardhat/console.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";
import { IERC20Burnable } from "../token/interfaces/IERC20Burnable.sol";

import { Utils } from "../utility/Utils.sol";
import { IBancorNetwork, IFlashLoanRecipient } from "../network/interfaces/IBancorNetwork.sol";

import { TestERC20Token } from "./TestERC20Token.sol";
import { TestFlashLoanRecipient } from "./TestIFlashLoanRecipient.sol";

contract MockExchanges is TestERC20Token, Utils {
    using SafeERC20 for IERC20;
    using TokenLibrary for Token;
    using EnumerableSet for EnumerableSet.AddressSet;

    Token public token0;
    Token public token1;

    MockUniswapV2Pair private immutable _weth;

    constructor(uint256 totalSupply, MockUniswapV2Pair weth) TestERC20Token("MultiExchange", "MULTI", totalSupply) {
        _weth = weth;
    }

    function setTokens(Token _token0, Token _token1) public {
        token0 = _token0;
        token1 = _token1;
    }

    function fakeSwap(address trader, uint256 amount) public returns (uint256) {
        if (token0.isNative() && !token1.isNative()) {
            payable(address(trader)).transfer(amount);
            token1.safeTransfer(trader, amount);
        } else if (!token0.isNative() && !token1.isNative()) {
            token0.safeTransferFrom(trader, address(this), amount);
            token1.safeTransfer(trader, amount);
        } else if (!token0.isNative() && token1.isNative()) {
            token0.safeTransferFrom(trader, address(this), amount);
            payable(address(trader)).transfer(amount);
        }
        return amount;
    }

    /**
     * Bancor V3 trade
     */
    function tradeBySourceAmount(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary
    ) external payable returns (uint256) {
        setTokens(sourceToken, targetToken);
        return fakeSwap(msg.sender, sourceAmount);
    }

    /**
     * Uniswap V3 trade
     */
    function exactInputSingle(ISwapRouter.ExactInputSingleParams memory params) external returns (uint256 amountOut) {
        // mimic Uniswap swap
        setTokens(Token(params.tokenIn), Token(params.tokenOut));
        return fakeSwap(params.recipient, params.amountIn);
    }

    /**
     * Uniswap V2 + Sushiswap trades
     */
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts) {
        // mimic swap
        setTokens(Token(path[0]), Token(path[1]));
        uint[] memory amounts = new uint[](1);
        amounts[0] = uint(fakeSwap(to, amountIn));
        return amounts;
    }

    function swapExactETHForTokens(
        uint amountIn,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable returns (uint[] memory amounts) {
        // mimic swap
        setTokens(Token(path[0]), Token(path[1]));
        uint[] memory amounts = new uint[](1);
        amounts[0] = uint(fakeSwap(to, amountIn));
        return amounts;
    }

    function swapExactTokensForETH(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts) {
        setTokens(Token(path[0]), Token(path[1]));
        uint[] memory amounts = new uint[](1);
        amounts[0] = uint(fakeSwap(to, amountIn));
        return amounts;
    }

    /**
     * Bancor V2 trade
     */
    function convertByPath(
        address[] memory _path,
        uint256 _amount,
        uint256 _minReturn,
        address _beneficiary,
        address _affiliateAccount,
        uint256 _affiliateFee
    ) external payable returns (uint256) {
        setTokens(Token(_path[0]), Token(_path[_path.length - 1]));
        uint256 res = fakeSwap(_beneficiary, _amount);
        return res;
    }

    /**
     * Bancor V2
     */
    function rateByPath(address[] memory _path, uint256 _amount) external view returns (uint256) {
        return _amount;
    }

    /**
     * Bancor V2
     */
    function conversionPath(Token sourceToken, Token targetToken) external view returns (address[] memory) {
        address[] memory path = new address[](3);
        path[0] = address(sourceToken);
        path[1] = address(targetToken);
        path[2] = address(targetToken);
        return path;
    }

    //solhint-disable-next-line func-name-mixedcase
    function WETH() external view returns (address) {
        return address(_weth);
    }

    receive() external payable {}
}
