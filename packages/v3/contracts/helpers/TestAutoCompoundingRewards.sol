// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { uncheckedInc } from "../utility/MathEx.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { AutoCompoundingStakingRewards } from "../stakingRewards/AutoCompoundingStakingRewards.sol";

import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";
import { Utils } from "../utility/Utils.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { TestTime } from "./TestTime.sol";
import { Time } from "../utility/Time.sol";

import { MathEx } from "../utility/MathEx.sol";
import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IVault } from "../vaults/interfaces/IVault.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";

import "hardhat/console.sol";

contract TestAutoCompoundingStakingRewards is AutoCompoundingStakingRewards, TestTime {
    constructor(IBancorNetwork initNetwork, IMasterPool initNetworkTokenPool)
        AutoCompoundingStakingRewards(initNetwork, initNetworkTokenPool)
    {}

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}
