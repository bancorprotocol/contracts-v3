// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IMintableToken } from "@bancor/token-governance/0.7.6/contracts/IMintableToken.sol";
import { TokenGovernance } from "@bancor/token-governance/0.7.6/contracts/TokenGovernance.sol";

contract TestTokenGovernance is TokenGovernance {
    constructor(IMintableToken mintableToken) TokenGovernance(mintableToken) {}
}
