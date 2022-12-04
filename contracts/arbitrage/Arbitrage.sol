// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IBancorNetwork, IFlashLoanRecipient } from "../network/interfaces/IBancorNetwork.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Token } from "../token/Token.sol";

/**
 * @dev The Arbitrage contract allows arbitraguers to arbitrage two tokens traded in Bancor v3
 * against Uniswap v2.
 * As an incentive the arbitraguer
 *  - Will receive min(10%, 100BNT) of the profit
 *  - Won't pay protocol fees on Bancor v3
 * 
 */
contract Arbitrage is Upgradeable {

    uint256 MAX_UINT256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    uint256[MAX_GAP - 0] private __gap;

    IBancorNetwork private immutable _bancorNetwork;
    Token private immutable _bnt;

    constructor(IBancorNetwork bancorNetwork, IERC20 bnt ) {
        _bancorNetwork = bancorNetwork;
        _bnt = Token(address(bnt));
    }

    function arbitrage(uint256 bntAmount, IFlashLoanRecipient recipient, IERC20 token1) external {
        // TODO: should the loan be taken as the contract or as the msg.sender?
        // TODO: don't charge fees for the loan
        _bancorNetwork.flashLoan(_bnt, bntAmount, recipient, '0x');
        // assert() balance of BNT is bntAmount
        // _bancorNetwork.tradeBySourceAmount(
        //     _bnt, // source token
        //     Token(address(token1)), // target token
        //     bntAmount, // source amount
        //     1,  // minimum to return
        //     MAX_UINT256, // deadline
        //     address(0) // beneficiary
        // );
    }

    function swap(uint256 bntAmount, Token token1, Token token2) external {
        // TODO: should the loan be taken as the contract or as the msg.sender?
        // TODO: don't charge fees for the loan
        // _bancorNetwork.flashLoan(_bnt, bntAmount, recipient, '0x');
        // assert() balance of BNT is bntAmount
        // _bancorNetwork.tradeBySourceAmount(
        //     token1, // source token
        //     token2, // target token
        //     bntAmount, // source amount
        //     1,  // minimum to return
        //     MAX_UINT256, // deadline
        //     address(0) // beneficiary
        // );

        _bancorNetwork.tradeBySourceAmount(
            token1,
            token2,
            bntAmount,
            1,  // minimum to return
            MAX_UINT256, // deadline
            address(0) // beneficiary
        );
    }

    function version() public pure override(Upgradeable) returns (uint16) {
        return 1;
    }
}