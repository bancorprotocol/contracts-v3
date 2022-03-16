// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IVault } from "../../vaults/interfaces/IVault.sol";

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";

import { Token } from "../../token/Token.sol";

// distribution types
uint8 constant FLAT_DISTRIBUTION = 0;
uint8 constant EXPONENTIAL_DECAY_DISTRIBUTION = 1;

struct ProgramData {
    uint32 startTime;
    uint32 endTime;
    uint32 prevDistributionTimestamp;
    IPoolToken poolToken;
    bool isEnabled;
    uint8 distributionType;
    IVault rewardsVault;
    uint256 totalRewards;
    uint256 remainingRewards;
}

interface IAutoCompoundingStakingRewards is IUpgradeable {
    /**
     * @dev returns the program data of a pool
     */
    function program(Token pool) external view returns (ProgramData memory);

    /**
     * @dev returns a list of all pools' program data
     */
    function programs() external view returns (ProgramData[] memory);

    /**
     * @dev returns a list of all the pools which have a program associated with them
     */
    function pools() external view returns (address[] memory);

    /**
     * @dev returns whether a program is currently active
     */
    function isProgramActive(Token pool) external view returns (bool);

    /**
     * @dev creates a program for a pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the pool must not have an active program
     */
    function createProgram(
        Token pool,
        IVault rewardsVault,
        uint256 totalRewards,
        uint8 distributionType,
        uint32 startTime,
        uint32 endTime
    ) external;

    /**
     * @dev terminates a rewards program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the program must be active
     */
    function terminateProgram(Token pool) external;

    /**
     * @dev enables or disables a program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function enableProgram(Token pool, bool status) external;

    /**
     * @dev processes program rewards
     */
    function processRewards(Token pool) external;
}
