// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { SafeMath } from "@openzeppelin/contracts/utils/math/SafeMath.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/utils/math/SignedSafeMath.sol";
import { MathEx } from "../../utility/MathEx.sol";
import { PPM_RESOLUTION } from "../../utility/Constants.sol";

uint256 constant M = PPM_RESOLUTION;

struct Output {
    int256 p; // network token amount removed from the trading liquidity
    int256 q; // network token amount renounced by the protocol
    uint256 r; // base token amount removed from the trading liquidity
    uint256 s; // base token amount removed from the vault
    uint256 t; // network token amount sent to the provider
    uint256 u; // base token amount removed from the external protection wallet
}

function isDeficit(
    uint256 b, // base token trading liquidity
    uint256 c, // base token excess amount
    uint256 e // base token staked amount
) pure returns (bool) {
    // assuming that the input has been validated
    unchecked {return b + c < e;}
}
