// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { TokenGovernance } from "@bancor/token-governance/contracts/TokenGovernance.sol";

contract TestTokenGovernance is TokenGovernance {
    constructor(IMintableToken mintableToken) TokenGovernance(mintableToken) {}
}
