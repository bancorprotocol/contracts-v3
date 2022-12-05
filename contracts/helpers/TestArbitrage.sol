// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";
import { Arbitrage } from "../../contracts/arbitrage/Arbitrage.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { Token } from "../token/Token.sol";

contract TestArbitrage is Arbitrage {

    constructor(IBancorNetwork bancorNetwork, Token bnt)
        Arbitrage(bancorNetwork, bnt)
    {
    }
}
