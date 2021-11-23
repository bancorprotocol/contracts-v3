// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import { IAutoCompoundingStakingRewards } from "./interfaces/IAutoCompoundingStakingRewards.sol";

import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";

enum DistributionType {
    FLAT,
    EXPONENTIAL_DECAY
}

struct ProgramData {
    address token;
    address rewardsVault;
    uint256 totalRewards;
    uint256 availableRewards;
    DistributionType distributionType;
    uint256 startTime;
    uint256 endTime;
    uint256 prevUpdate;
    bool isEnabled;
}

error ProgramAlreadyRunning();

/**
 * @dev Auto Compounding Staking Rewards contract
 */
contract AutoCompoundingStakingRewards is IAutoCompoundingStakingRewards {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    mapping(address => ProgramData) private _programs;

    EnumerableSetUpgradeable.AddressSet private _programByPool;

    event ProgramCreated(
        address indexed token,
        address rewardsVault,
        uint256 totalRewards,
        uint8 distributionType,
        uint256 startTime,
        uint256 endTime
    );

    event ProgramTerminated(address indexed token, uint256 prevEndTime, uint256 availableRewards);

    event ProgramEnabled(address indexed pool, bool status, uint256 availableRewards);

    event RewardsDistributed(
        address indexed token,
        uint256 rewardsAmount,
        uint256 poolTokenAmount,
        uint256 timeElapsed,
        uint256 availableRewards
    );

    /**
     * @dev
     */
    constructor() {}

    function program(address pool) external view returns (ProgramData memory) {
        return _programs[pool];
    }

    function programs() external view returns (ProgramData[] memory) {
        uint256 totalProgram = _programByPool.length();

        ProgramData[] memory returnedPrograms = new ProgramData[](totalProgram);

        for (uint256 i = 0; i < totalProgram; i++) {
            returnedPrograms[i] = _programs[_programByPool.at(i)];
        }

        return returnedPrograms;
    }

    function isProgramActive(address pool) public view returns (bool) {
        ProgramData storage currentProgram = _programs[pool];

        if (currentProgram.availableRewards > 0) {
            return false;
        }

        if (block.timestamp < currentProgram.startTime) {
            return false;
        }

        if (currentProgram.distributionType == DistributionType.FLAT) {
            if (block.timestamp > currentProgram.endTime) {
                return false;
            }
        }

        return true;
    }

    function createProgram(
        address pool,
        address rewardsVault,
        uint256 totalRewards,
        DistributionType distributionType,
        uint256 startTime,
        uint256 endTime
    ) external {
        if (isProgramActive(pool)) {
            revert ProgramAlreadyRunning();
        }

        ProgramData storage currentProgram = _programs[pool];
    }

    function terminateProgram(address pool) external {
        if (!isProgramActive(pool)) {
            revert ProgramAlreadyRunning();
        }

        ProgramData storage currentProgram = _programs[pool];

        if (currentProgram.distributionType == DistributionType.FLAT) {
            currentProgram.endTime = block.timestamp;
        }

        currentProgram.availableRewards = 0;

        emit ProgramTerminated();
    }
}
