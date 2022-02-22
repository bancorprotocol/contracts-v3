// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IVault } from "../../vaults/interfaces/IVault.sol";

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";

import { Token } from "../../token/Token.sol";

struct ProgramData {
    uint32 startTime;
    uint32 endTime;
    uint32 prevDistributionTimestamp;
    IPoolToken poolToken;
    bool isEnabled;
    IVault rewardsVault;
    Token rewardsToken;
    uint256 rewardsRate;
    // remainingRewards ?
}

interface IStandardStakingRewards is IUpgradeable {}
