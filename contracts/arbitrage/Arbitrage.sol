// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IBancorNetwork, IFlashLoanRecipient } from "../network/interfaces/IBancorNetwork.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";

// TODO: remove next line
import "hardhat/console.sol";


/**
 * @dev The Arbitrage contract allows arbitraguers to arbitrage two tokens traded in Bancor v3
 * against Uniswap v2.
 * As an incentive the arbitraguer
 *  - Will receive min(10%, 100BNT) of the profit
 *  - Won't pay protocol fees on Bancor v3
 * 
 */
contract Arbitrage is Upgradeable, ReentrancyGuardUpgradeable {
    using TokenLibrary for Token;

    IBancorNetwork private immutable _bancorNetwork;
    Token private immutable _bnt;

    constructor(IBancorNetwork bancorNetwork, Token bnt) {
        _bancorNetwork = bancorNetwork;
        _bnt = bnt;
    }

    function arbitrage(
        uint256 bntAmount,
        Token token1,
        Token token2, 
        IFlashLoanRecipient recipient, 
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary,
        address trader
    ) external {
        borrow(_bnt, bntAmount, recipient);
        uint256 token1Amount = swapOnBancor(bntAmount, _bnt, token1, minReturnAmount, deadline, beneficiary, trader);
        uint256 token2Amount = swapOnUniswap(token1Amount, token1, token2);
        uint256 bntAmount2 = swapOnBancor(token2Amount, token2, _bnt, minReturnAmount, deadline, beneficiary, trader);
        assert(bntAmount2 > bntAmount);
        // returnLoan()
        splitProfit();
    }

    function borrow(Token token, uint256 bntAmount, IFlashLoanRecipient recipient) public {
        _bancorNetwork.flashLoan(token, bntAmount, recipient, '0x');
    }

    function swapOnBancor(        
        uint256 sourceAmount,
        Token sourceToken,
        Token targetToken,
        uint256 minReturnAmount,
        uint256 deadline,
        address beneficiary,
        address trader
        ) public payable nonReentrant returns (uint256 targetAmount) {
        targetAmount = _bancorNetwork.tradeBySourceAmount2(
            sourceToken,
            targetToken,
            sourceAmount,
            minReturnAmount,
            deadline,
            beneficiary,
            trader
        );
        return targetAmount;
    }

    function swapOnUniswap(uint256 token1Amount, Token token1, Token token2) public nonReentrant returns (uint256 token2Amount) {
        // TODO: implement
        return 1;
    }

    function splitProfit() public {
        // TODO: implement
    }

    function version() public pure override(Upgradeable) returns (uint16) {
        return 1;
    }
}