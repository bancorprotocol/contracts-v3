// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { uncheckedInc } from "../utility/MathEx.sol";

import { IAutoCompoundingStakingRewards } from "./interfaces/IAutoCompoundingStakingRewards.sol";

import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";

enum DistributionType {
    FLAT,
    EXPONENTIAL_DECAY
}

struct ProgramData {
    address pool;
    address rewardsVault;
    uint256 totalRewards;
    uint256 availableRewards;
    DistributionType distributionType;
    uint256 startTime;
    uint256 endTime;
    uint256 lastUpdate;
    bool isEnabled;
}

error ProgramAlreadyRunning();

/**
 * @dev Auto Compounding Staking Rewards contract
 */
contract AutoCompoundingStakingRewards is IAutoCompoundingStakingRewards, ReentrancyGuardUpgradeable, Upgradeable {
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // a mapping between a pool address and a program
    mapping(address => ProgramData) private _programs;

    // a set of all pool that have a program
    EnumerableSetUpgradeable.AddressSet private _programByPool;

    /**
     * @dev triggered when a program is created
     */
    event ProgramCreated(
        address indexed pool,
        address rewardsVault,
        uint256 totalRewards,
        DistributionType distributionType,
        uint256 startTime,
        uint256 endTime
    );

    /**
     * @dev triggered when a program is terminated
     */
    event ProgramTerminated(address indexed pool, uint256 prevEndTime, uint256 availableRewards);

    /**
     * @dev triggered when a program status is updated
     */
    event ProgramEnabled(address indexed pool, bool status, uint256 availableRewards);

    /**
     * @dev triggered when rewards are distributed
     */
    event RewardsDistributed(
        address indexed pool,
        uint256 rewardsAmount,
        uint256 poolTokenAmount,
        uint256 timeElapsed,
        uint256 availableRewards
    );

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __AutoCompoundingStakingRewards_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __AutoCompoundingStakingRewards_init() internal initializer {
        __Upgradeable_init();
        __ReentrancyGuard_init();

        __AutoCompoundingStakingRewards_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __AutoCompoundingStakingRewards_init_unchained() internal initializer {}

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @dev returns the program data of a pool
     */
    function program(address pool) external view returns (ProgramData memory) {
        return _programs[pool];
    }

    /**
     * @dev returns a list of all pools' program data
     */
    function programs() external view returns (ProgramData[] memory) {
        uint256 totalProgram = _programByPool.length();
        ProgramData[] memory list = new ProgramData[](totalProgram);
        for (uint256 i = 0; i < totalProgram; i = uncheckedInc(i)) {
            list[i] = _programs[_programByPool.at(i)];
        }
        return list;
    }

    /**
     * @dev returns wether a program is active or not
     */
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

    /**
     * @dev create a program for a pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - pool's program must not be active
     */
    function createProgram(
        address pool,
        address rewardsVault,
        uint256 totalRewards,
        DistributionType distributionType,
        uint256 startTime,
        uint256 endTime
    ) external onlyAdmin {
        if (isProgramActive(pool)) {
            revert ProgramAlreadyRunning();
        }

        ProgramData storage currentProgram = _programs[pool];

        // if rewards vault address is different from address(0) then they was a previous program
        if (rewardsVault != address(0)) {
            // process rewards to make sure there's no rewards left for that pool
            processRewards(pool);
        }

        // currentProgram.pool shouldn't change
        currentProgram.rewardsVault = rewardsVault;
        currentProgram.totalRewards = totalRewards;
        currentProgram.availableRewards = totalRewards;
        currentProgram.distributionType = distributionType;
        currentProgram.startTime = startTime;
        currentProgram.endTime = endTime;
        currentProgram.lastUpdate = block.timestamp;
        currentProgram.isEnabled = true;

        emit ProgramCreated(pool, rewardsVault, totalRewards, distributionType, startTime, endTime);
    }

    function terminateProgram(address pool) external onlyAdmin {
        if (!isProgramActive(pool)) {
            revert ProgramAlreadyRunning();
        }

        ProgramData storage currentProgram = _programs[pool];

        if (currentProgram.distributionType == DistributionType.FLAT) {
            currentProgram.endTime = block.timestamp;
        }

        currentProgram.availableRewards = 0;

        emit ProgramTerminated(pool, 0, 0);
    }

    /**
     * @dev enable or disable a pool's program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function enableProgram(address pool, bool status) external onlyAdmin {
        ProgramData storage currentProgram = _programs[pool];

        currentProgram.isEnabled = status;
    }

    /**
     * @dev process a pool's rewards
     */
    function processRewards(address pool) public nonReentrant {
        if (!isProgramActive(pool)) {
            return;
        }
    }
}
