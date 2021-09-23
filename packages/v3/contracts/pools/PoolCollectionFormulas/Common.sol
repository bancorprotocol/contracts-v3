// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { MathEx } from "../../utility/MathEx.sol";
import { MAX_UINT128, MAX_UINT256, PPM_RESOLUTION } from "../../utility/Constants.sol";

uint256 constant M = PPM_RESOLUTION;

struct Output {
    uint256 p; // BNT trading liquidity removed from the pool
    uint256 q; // BNT minted for the user as compensation
    uint256 r; // TKN trading liquidity removed from the pool
    uint256 s; // TKN removed from the vault
    uint256 t; // BNT sent to the user
}
