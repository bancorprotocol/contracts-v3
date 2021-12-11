// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";
import { IVault } from "../../vaults/interfaces/IVault.sol";
import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";
import { ReserveToken, ReserveTokenLibrary } from "../../token/ReserveToken.sol";

enum DistributionType {
    FLAT,
    EXPONENTIAL_DECAY
}

struct ProgramData {
    uint32 startTime;
    uint32 endTime;
    uint32 prevDistributionTimestamp;
    uint256 totalRewards;
    uint256 availableRewards;
    IVault rewardsVault;
    IPoolToken poolToken;
    bool isEnabled;
    DistributionType distributionType;
}

interface IAutoCompoundingStakingRewards is IUpgradeable {
    /**
     * @dev returns the program data of a pool
     */
    function program(ReserveToken pool) external view returns (ProgramData memory);

    /**
     * @dev returns a list of all pools' program data
     */
    function programs() external view returns (ProgramData[] memory);

    /**
     * @dev returns wether a program is active or not
     */
    function isProgramActive(ReserveToken pool) external view returns (bool);

    /**
     * @dev create a program for a pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the pool must not already have an active program
     */
    function createProgram(
        ReserveToken pool,
        IVault rewardsVault,
        uint256 totalRewards,
        DistributionType distributionType,
        uint32 startTime,
        uint32 endTime
    ) external;

    /**
     * @dev terminate a rewards program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - program should be active
     */
    function terminateProgram(ReserveToken pool) external;

    /**
     * @dev enable or disable a pool's program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function enableProgram(ReserveToken pool, bool status) external;

    /**
     * @dev process a pool's rewards
     */
    function processRewards(ReserveToken pool) external;
}