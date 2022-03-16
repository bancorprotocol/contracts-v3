// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";

import { Token } from "../../token/Token.sol";

struct ProgramData {
    uint256 id;
    Token pool;
    IPoolToken poolToken;
    Token rewardsToken;
    bool isEnabled;
    uint32 startTime;
    uint32 endTime;
    uint256 rewardRate;
}

struct StakeAmounts {
    uint256 stakedRewardAmount;
    uint256 poolTokenAmount;
}

interface IStandardStakingRewards is IUpgradeable {
    /**
     * @dev returns all program ids
     */
    function programsIds() external view returns (uint256[] memory);

    /**
     * @dev returns program data for each specified program id
     */
    function programs(uint256[] calldata ids) external view returns (ProgramData[] memory);

    /**
     * @dev returns all the program ids that the provider participates in
     */
    function providerProgramIds(address provider) external view returns (uint256[] memory);

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
     * @dev returns whether the specified program is enabled
     */
    function isProgramEnabled(uint256 id) external view returns (bool);

    /**
     * @dev returns the ID of the currently active program of a given pool
     * returns 0 if no program is currently active for the given pool
     */
    function activeProgramId(Token pool) external view returns (uint256);

    /**
     * @dev creates a program for a pool and returns its ID
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - the pool must not have an active program
     * - if the rewards token isn't the BNT token, then the rewards must have been deposited to the rewards vault
     */
    function createProgram(
        Token pool,
        Token rewardsToken,
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
     * @dev enables or disables a program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function enableProgram(uint256 id, bool status) external;

    /**
     * @dev adds a provider to the program
     *
     * requirements:
     *
     * - the caller must have approved the contract to transfer pool tokens on its behalf
     */
    function join(uint256 id, uint256 poolTokenAmount) external;

    /**
     * @dev adds provider's stake to the program by providing an EIP712 typed signature for an EIP2612 permit request
     *
     * requirements:
     *
     * - the caller must have specified a valid and unused EIP712 typed signature
     */
    function joinPermitted(
        uint256 id,
        uint256 poolTokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

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
     * - the caller must have approved the network contract to transfer the tokens its behalf (ETH is handled separately)
     */
    function depositAndJoin(uint256 id, uint256 tokenAmount) external payable;

    /**
     * @dev deposits and adds provider's stake to the program by providing an EIP712 typed signature for an EIP2612
     * permit request
     *
     * requirements:
     *
     * - the caller must have specified a valid and unused EIP712 typed signature
     */
    function depositAndJoinPermitted(
        uint256 id,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;

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
    function claimRewards(uint256[] calldata ids, uint256 maxAmount) external returns (uint256);

    /**
     * @dev claims and stake rewards and returns the claimed reward amount and the received pool token amount
     *
     * requirements:
     *
     * - the specified program ids array needs to consist from unique and existing program ids with the same reward
     *   token
     * - the rewards token must have been whitelisted with an existing pool
     */
    function stakeRewards(uint256[] calldata ids, uint256 maxAmount) external returns (StakeAmounts memory);
}
