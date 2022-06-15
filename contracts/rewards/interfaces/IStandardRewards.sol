// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";

import { Token } from "../../token/Token.sol";

struct Rewards {
    uint32 lastUpdateTime;
    uint256 rewardPerToken;
}

struct ProgramData {
    uint256 id;
    Token pool;
    IPoolToken poolToken;
    Token rewardsToken;
    bool isPaused;
    uint32 startTime;
    uint32 endTime;
    uint256 rewardRate;
    uint256 remainingRewards;
}

struct ProviderRewards {
    uint256 rewardPerTokenPaid;
    uint256 pendingRewards;
    uint256 reserved0;
    uint256 stakedAmount;
}

struct StakeAmounts {
    uint256 stakedRewardAmount;
    uint256 poolTokenAmount;
}

interface IStandardRewards is IUpgradeable {
    /**
     * @dev returns all program ids
     */
    function programIds() external view returns (uint256[] memory);

    /**
     * @dev returns program data for each specified program id
     */
    function programs(uint256[] calldata ids) external view returns (ProgramData[] memory);

    /**
     * @dev returns all the program ids that the provider participates in
     */
    function providerProgramIds(address provider) external view returns (uint256[] memory);

    /**
     * @dev returns program rewards
     */
    function programRewards(uint256 id) external view returns (Rewards memory);

    /**
     * @dev returns provider rewards
     */
    function providerRewards(address provider, uint256 id) external view returns (ProviderRewards memory);

    /**
     * @dev returns the total staked amount in a specific program
     */
    function programStake(uint256 id) external view returns (uint256);

    /**
     * @dev returns the total staked amount of a specific provider in a specific program
     */
    function providerStake(address provider, uint256 id) external view returns (uint256);

    /**
     * @dev returns whether the specified program is active
     */
    function isProgramActive(uint256 id) external view returns (bool);

    /**
     * @dev returns whether the specified program is paused
     */
    function isProgramPaused(uint256 id) external view returns (bool);

    /**
     * @dev returns the ID of the latest program for a given pool (or 0 if no program is currently set)
     */
    function latestProgramId(Token pool) external view returns (uint256);

    /**
     * @dev creates a program for a pool and returns its ID
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the pool must not have an active program
     */
    function createProgram(
        Token pool,
        uint256 totalRewards,
        uint32 startTime,
        uint32 endTime
    ) external returns (uint256);

    /**
     * @dev terminates a rewards program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the program must exist and be the active program for its pool
     */
    function terminateProgram(uint256 id) external;

    /**
     * @dev pauses/resumes a program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function pauseProgram(uint256, bool pause) external;

    /**
     * @dev adds a provider to the program
     *
     * requirements:
     *
     * - the caller must have approved the contract to transfer pool tokens on its behalf
     */
    function join(uint256 id, uint256 poolTokenAmount) external;

    /**
     * @dev removes (some of) provider's stake from the program
     *
     * requirements:
     *
     * - the caller must have specified a valid and unused EIP712 typed signature
     */
    function leave(uint256 id, uint256 poolTokenAmount) external;

    /**
     * @dev deposits and adds provider's stake to the program
     *
     * requirements:
     *
     * - the caller must have approved the network contract to transfer the tokens its behalf (except for in the
     *   native token case)
     */
    function depositAndJoin(uint256 id, uint256 tokenAmount) external payable;

    /**
     * @dev returns provider's pending rewards
     *
     * requirements:
     *
     * - the specified program ids array needs to consist from unique and existing program ids with the same reward
     *   token
     */
    function pendingRewards(address provider, uint256[] calldata ids) external view returns (uint256);

    /**
     * @dev claims rewards and returns the claimed reward amount
     */
    function claimRewards(uint256[] calldata ids) external returns (uint256);

    /**
     * @dev claims and stake rewards and returns the claimed reward amount and the received pool token amount
     *
     * requirements:
     *
     * - the specified program ids array needs to consist from unique and existing program ids with the same reward
     *   token
     * - the rewards token must have been whitelisted with an existing pool
     */
    function stakeRewards(uint256[] calldata ids) external returns (StakeAmounts memory);
}
