// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { MathEx } from "../../utility/MathEx.sol";
import { MAX_UINT128, MAX_UINT256, PPM_RESOLUTION } from "../../utility/Constants.sol";

uint256 constant M = PPM_RESOLUTION;

struct Output {
    uint256 p; // network token amount removed from the trading liquidity
    uint256 q; // network token amount renounced by the protocol
    uint256 r; // base token amount removed from the trading liquidity
    uint256 s; // base token amount removed from the vault
    uint256 t; // network token amount sent to the provider
    uint256 u; // base token amount removed from the external protection wallet
}
