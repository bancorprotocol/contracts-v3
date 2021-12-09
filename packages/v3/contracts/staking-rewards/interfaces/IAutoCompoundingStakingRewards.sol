// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";
import { IVault } from "../../vaults/interfaces/IVault.sol";
import { ReserveToken, ReserveTokenLibrary } from "../../token/ReserveToken.sol";

enum DistributionType {
    FLAT,
    EXPONENTIAL_DECAY
}

struct ProgramData {
    uint256 startTime;
    uint256 endTime;
    uint256 prevDistributionTimestamp;
    uint256 totalRewards;
    uint256 availableRewards;
    IVault rewardsVault;
    ReserveToken pool;
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
        uint256 startTime,
        uint256 endTime
    ) external;

    /**
     * @dev terminate a rewards program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
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
