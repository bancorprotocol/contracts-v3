// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AccessDenied, AlreadyExists } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

import { INetworkSettings, NotWhitelisted } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary, Signature } from "../token/TokenLibrary.sol";

import { IExternalRewardsVault } from "../vaults/interfaces/IExternalRewardsVault.sol";

import { IStandardStakingRewards, ProgramData } from "./interfaces/IStandardStakingRewards.sol";

/**
 * @dev Standard Staking Rewards contract
 */
contract StandardStakingRewards is IStandardStakingRewards, ReentrancyGuardUpgradeable, Utils, Time, Upgradeable {
    using Address for address payable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using TokenLibrary for Token;

    struct Rewards {
        uint32 lastUpdateTime;
        uint256 rewardPerToken;
    }

    struct ProviderRewards {
        uint256 rewardPerTokenPaid;
        uint256 pendingRewards;
        uint256 claimedRewards;
    }

    struct RewardData {
        Token pool;
        Token rewardsToken;
        uint256 amount;
    }

    error ArrayNotUnique();
    error EthAmountMismatch();
    error InsufficientFunds();
    error InvalidParam();
    error PoolMismatch();
    error ProgramAlreadyExists();
    error ProgramDoesNotExist();
    error ProgramDisabled();
    error ProgramInactive();
    error RewardsTokenMismatch();

    // since we will be dividing by the total amount of protected tokens in units of wei, we can encounter cases
    // where the total amount in the denominator is higher than the product of the rewards rate and staking duration. In
    // order to avoid this imprecision, we will amplify the reward rate by the units amount.
    uint256 private constant REWARD_RATE_FACTOR = 1e18;

    uint256 private constant INITIAL_PROGRAM_ID = 1;

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the address of the BNT token governance
    ITokenGovernance internal immutable _bntGovernance;

    // the BNT contract
    IERC20 private immutable _bnt;

    // the BNT pool token contract
    IPoolToken private immutable _bntPoolToken;

    // the address of the external rewards vault
    IExternalRewardsVault private immutable _externalRewardsVault;

    // the ID of the next created program
    uint256 private _nextProgramId;

    // a mapping between providers and the program IDs of the program they are participating in
    mapping(address => EnumerableSetUpgradeable.UintSet) private _programIdsByProvider;

    // a mapping between program IDs and program data
    mapping(uint256 => ProgramData) private _programs;

    // a mapping between pools and their currently active programs
    mapping(Token => uint256) private _activeProgramIdByPool;

    // a mapping between programs and their respective rewards data
    mapping(uint256 => Rewards) private _programRewards;

    // a mapping between providers and their respective rewards data
    mapping(address => ProviderRewards) private _providerRewards;

    // a mapping between programs and their total stakes
    mapping(uint256 => uint256) private _programStakes;

    // a mapping between programs, providers and their stake amounts in specific programs
    mapping(uint256 => mapping(address => uint256)) private _providerStakes;

    // a mapping between reward tokens and total unclaimed rewards
    mapping(Token => uint256) private _unclaimedRewards;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 11] private __gap;

    /**
     * @dev triggered when a program is created
     */
    event ProgramCreated(
        Token indexed pool,
        uint256 indexed programId,
        Token rewardsToken,
        uint256 totalRewards,
        uint32 startTime,
        uint32 endTime
    );

    /**
     * @dev triggered when a program is terminated prematurely
     */
    event ProgramTerminated(Token indexed pool, uint256 indexed programId, uint32 endTime, uint256 remainingRewards);

    /**
     * @dev triggered when a program is enabled/disabled
     */
    event ProgramEnabled(Token indexed pool, uint256 indexed programId, bool status, uint256 remainingRewards);

    /**
     * @dev triggered when a provider joins a program
     */
    event ProviderJoined(
        Token indexed pool,
        uint256 indexed programId,
        address indexed provider,
        uint256 poolTokenAmount,
        uint256 prevStake
    );

    /**
     * @dev triggered when a provider leaves a program (even if partially)
     */
    event ProviderLeft(
        Token indexed pool,
        uint256 indexed programId,
        address indexed provider,
        uint256 poolTokenAmount,
        uint256 remainingStake
    );

    /**
     * @dev triggered when pending rewards are being claimed
     */
    event RewardsClaimed(Token indexed pool, uint256 indexed programId, address indexed provider, uint256 amount);

    /**
     * @dev triggered when pending rewards are being staked
     */
    event RewardsStaked(Token indexed pool, uint256 indexed programId, address indexed provider, uint256 amount);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        ITokenGovernance initBNTGovernance,
        IBNTPool initBNTPool,
        IExternalRewardsVault initExternalRewardsVault
    )
        validAddress(address(initNetwork))
        validAddress(address(initNetworkSettings))
        validAddress(address(initBNTGovernance))
        validAddress(address(initBNTPool))
        validAddress(address(initExternalRewardsVault))
    {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _bntGovernance = initBNTGovernance;
        _bnt = initBNTGovernance.token();
        _bntPoolToken = initBNTPool.poolToken();
        _externalRewardsVault = initExternalRewardsVault;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __StandardStakingRewards_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __StandardStakingRewards_init() internal initializer {
        __ReentrancyGuard_init();
        __Upgradeable_init();

        __StandardStakingRewards_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __StandardStakingRewards_init_unchained() internal initializer {
        _nextProgramId = INITIAL_PROGRAM_ID;
    }

    // solhint-enable func-name-mixedcase

    modifier uniqueArray(uint256[] calldata ids) {
        if (!_isArrayUnique(ids)) {
            revert ArrayNotUnique();
        }

        _;
    }

    /**
     * @inheritdoc IVersioned
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function programsIds() external view returns (uint256[] memory) {
        uint256 lastProgramId = _nextProgramId - 1;
        uint256[] memory ids = new uint256[](lastProgramId);

        for (uint256 i = INITIAL_PROGRAM_ID; i <= lastProgramId; i++) {
            ids[i - 1] = i;
        }

        return ids;
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function programs(uint256[] calldata ids) external view uniqueArray(ids) returns (ProgramData[] memory) {
        uint256 length = ids.length;
        ProgramData[] memory list = new ProgramData[](ids.length);

        for (uint256 i = 0; i < length; i++) {
            list[i] = _programs[ids[i]];
        }

        return list;
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function providerPrograms(address provider) external view returns (uint256[] memory) {
        return _programIdsByProvider[provider].values();
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function isProgramActive(uint256 id) external view returns (bool) {
        return _isProgramActive(_programs[id]);
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function createProgram(
        Token pool,
        Token rewardsToken,
        uint256 totalRewards,
        uint32 startTime,
        uint32 endTime
    ) external validAddress(address(address(pool))) validAddress(address(rewardsToken)) onlyAdmin nonReentrant {
        uint32 currTime = _time();
        if (!(currTime <= startTime && startTime < endTime)) {
            revert InvalidParam();
        }

        // ensure that no active program exists for the specific pool
        if (_activeProgramIdByPool[pool] != 0) {
            revert ProgramAlreadyExists();
        }

        IPoolToken poolToken;
        uint256 unclaimedRewards = _unclaimedRewards[rewardsToken];

        if (_isBNT(pool)) {
            poolToken = _bntPoolToken;
        } else {
            if (!_networkSettings.isTokenWhitelisted(pool)) {
                revert NotWhitelisted();
            }

            // ensure that the rewards were already deposited to the rewards vault
            if (rewardsToken.balanceOf(address(_externalRewardsVault)) - unclaimedRewards < totalRewards) {
                revert InsufficientFunds();
            }

            poolToken = _network.collectionByPool(pool).poolToken(pool);
        }

        uint256 id = _nextProgramId++;

        _programs[id] = ProgramData({
            id: id,
            pool: pool,
            poolToken: poolToken,
            rewardsToken: rewardsToken,
            isEnabled: true,
            startTime: startTime,
            endTime: endTime,
            rewardRate: totalRewards / (endTime - startTime)
        });

        // add the program ID to the active programs list
        _activeProgramIdByPool[pool] = id;

        // increase the unclaimed rewards for the token by the total rewards in the new program
        _unclaimedRewards[rewardsToken] = unclaimedRewards + totalRewards;

        emit ProgramCreated({
            pool: pool,
            programId: id,
            rewardsToken: rewardsToken,
            totalRewards: totalRewards,
            startTime: startTime,
            endTime: endTime
        });
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function terminateProgram(uint256 id) external onlyAdmin {
        ProgramData memory p = _programs[id];

        _verifyProgramActive(p);

        // remove the program from the active programs list
        _activeProgramIdByPool[p.pool] = 0;

        // reduce the unclaimed rewards for the token by the remaining rewards
        uint256 remainingRewards = _remainingRewards(p);
        _unclaimedRewards[p.rewardsToken] -= remainingRewards;

        emit ProgramTerminated(p.pool, id, p.endTime, remainingRewards);
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function enableProgram(uint256 id, bool status) external onlyAdmin {
        ProgramData storage p = _programs[id];

        _verifyProgramActive(p);

        bool prevStatus = p.isEnabled;
        if (prevStatus == status) {
            return;
        }

        p.isEnabled = status;

        emit ProgramEnabled({ pool: p.pool, programId: id, status: status, remainingRewards: _remainingRewards(p) });
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function join(uint256 id, uint256 poolTokenAmount) external greaterThanZero(poolTokenAmount) nonReentrant {
        ProgramData memory p = _programs[id];

        _verifyProgramActive(p);

        _join(msg.sender, p, poolTokenAmount);
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function joinPermitted(
        uint256 id,
        uint256 poolTokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external greaterThanZero(poolTokenAmount) nonReentrant {
        ProgramData memory p = _programs[id];

        _verifyProgramActive(p);

        // permit the amount the caller is trying to stake. Please note, that if the base token doesn't support
        // EIP2612 permit - either this call or the inner transferFrom will revert
        p.poolToken.permit(msg.sender, address(this), poolTokenAmount, deadline, v, r, s);

        _join(msg.sender, p, poolTokenAmount);
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function depositAndJoin(uint256 id, uint256 tokenAmount)
        external
        payable
        greaterThanZero(tokenAmount)
        nonReentrant
    {
        ProgramData memory p = _programs[id];

        _verifyProgramActive(p);

        _depositAndJoin(msg.sender, p, tokenAmount);
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function depositAndJoinPermitted(
        uint256 id,
        uint256 tokenAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external greaterThanZero(tokenAmount) nonReentrant {
        ProgramData memory p = _programs[id];

        _verifyProgramActive(p);

        p.pool.permit(msg.sender, address(_network), tokenAmount, deadline, Signature({ v: v, r: r, s: s }));

        _depositAndJoin(msg.sender, p, tokenAmount);
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function leave(uint256 id, uint256 poolTokenAmount) external greaterThanZero(poolTokenAmount) nonReentrant {
        ProgramData memory p = _programs[id];

        _verifyProgramExists(p);

        _leave(msg.sender, p, poolTokenAmount);
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function pendingRewards(address provider, uint256[] calldata ids) external view uniqueArray(ids) returns (uint256) {
        uint256 reward = 0;
        Token rewardsToken;

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];

            ProgramData memory p = _programs[id];

            _verifyProgramExists(p);

            if (i == 0) {
                rewardsToken = p.rewardsToken;
            }

            if (p.rewardsToken != rewardsToken) {
                revert RewardsTokenMismatch();
            }

            uint256 newRewardPerToken = _rewardPerToken(p, _programRewards[id]);
            ProviderRewards memory providerRewards = _providerRewards[provider];

            reward += _pendingRewards(provider, id, newRewardPerToken, providerRewards);
        }

        return reward;
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function claimRewards(uint256[] calldata ids, uint256 maxAmount) external uniqueArray(ids) returns (uint256) {
        RewardData memory rewardData = _claimRewards(msg.sender, ids, maxAmount, false);

        _distributeRewards(msg.sender, rewardData);

        return rewardData.amount;
    }

    /**
     * @inheritdoc IStandardStakingRewards
     */
    function stakeRewards(uint256[] calldata ids, uint256 maxAmount) external uniqueArray(ids) returns (uint256) {
        RewardData memory rewardData = _claimRewards(msg.sender, ids, maxAmount, true);

        _distributeRewards(address(this), rewardData);

        rewardData.rewardsToken.ensureApprove(address(_network), rewardData.amount);

        return _network.depositFor(msg.sender, rewardData.rewardsToken, rewardData.amount);
    }

    /**
     * @dev adds provider's stake to the program
     */
    function _join(
        address provider,
        ProgramData memory p,
        uint256 poolTokenAmount
    ) private {
        // take a snapshot of the existing rewards (before increasing the stake)
        _snapshotRewards(p, provider);

        // update both program and provider stakes
        _programStakes[p.id] += poolTokenAmount;

        uint256 prevStake = _providerStakes[p.id][provider];
        _providerStakes[p.id][provider] = prevStake + poolTokenAmount;

        // transfer the tokens from the provider (we aren't using safeTransferFrom, since the PoolToken contract is
        // fully compliant)
        p.poolToken.transferFrom(provider, address(this), poolTokenAmount);

        emit ProviderJoined({
            pool: p.pool,
            programId: p.id,
            provider: provider,
            poolTokenAmount: poolTokenAmount,
            prevStake: prevStake
        });
    }

    /**
     * @dev removes (some of) provider's from the program
     */
    function _leave(
        address provider,
        ProgramData memory p,
        uint256 poolTokenAmount
    ) private {
        // take a snapshot of the existing rewards (before decreasing the stake)
        _snapshotRewards(p, provider);

        // update both program and provider stakes
        _programStakes[p.id] -= poolTokenAmount;

        uint256 remainingStake = _providerStakes[p.id][provider] - poolTokenAmount;
        _providerStakes[p.id][provider] = remainingStake;

        // transfer the tokens from the provider (we aren't using safeTransferFrom, since the PoolToken contract is
        // fully compliant)
        p.poolToken.transferFrom(address(this), provider, poolTokenAmount);

        emit ProviderLeft({
            pool: p.pool,
            programId: p.id,
            provider: provider,
            poolTokenAmount: poolTokenAmount,
            remainingStake: remainingStake
        });
    }

    /**
     * @dev deposits and adds provider's stake to the program
     */
    function _depositAndJoin(
        address provider,
        ProgramData memory p,
        uint256 tokenAmount
    ) private {
        uint256 poolTokenAmount;

        if (p.pool.isNative()) {
            if (msg.value < tokenAmount) {
                revert EthAmountMismatch();
            }

            poolTokenAmount = _network.depositFor{ value: tokenAmount }(provider, p.pool, tokenAmount);

            // refund the caller for the remaining ETH
            if (msg.value > tokenAmount) {
                payable(address(provider)).sendValue(msg.value - tokenAmount);
            }
        } else {
            if (msg.value > 0) {
                revert EthAmountMismatch();
            }

            // please note that that providers should have approved the network to spend their tokens explicitly
            poolTokenAmount = _network.depositFor(provider, p.pool, tokenAmount);
        }

        _join(provider, p, poolTokenAmount);
    }

    /**
     * @dev claims rewards
     */
    function _claimRewards(
        address provider,
        uint256[] calldata ids,
        uint256 maxAmount,
        bool stake
    ) private returns (RewardData memory) {
        RewardData memory rewardData = RewardData({
            pool: Token(address(0)),
            rewardsToken: Token(address(0)),
            amount: 0
        });

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];

            ProgramData memory p = _programs[id];

            _verifyProgramExists(p);

            if (i == 0) {
                rewardData.pool = p.pool;
                rewardData.rewardsToken = p.rewardsToken;
            }

            if (p.rewardsToken != rewardData.rewardsToken) {
                revert RewardsTokenMismatch();
            }

            uint256 programReward = _claimRewards(provider, p, maxAmount);

            rewardData.amount += programReward;

            if (maxAmount != type(uint256).max) {
                maxAmount -= programReward;
            }

            if (stake) {
                emit RewardsClaimed({ pool: p.pool, programId: p.id, provider: provider, amount: programReward });
            } else {
                emit RewardsStaked({ pool: p.pool, programId: p.id, provider: provider, amount: programReward });
            }
        }

        // decrease the unclaimed rewards for the token by the total claimed rewards
        _unclaimedRewards[rewardData.rewardsToken] -= rewardData.amount;

        return rewardData;
    }

    /**
     * @dev claims rewards
     */
    function _claimRewards(
        address provider,
        ProgramData memory p,
        uint256 maxAmount
    ) private returns (uint256) {
        ProviderRewards storage providerRewards = _snapshotRewards(p, provider);

        uint256 reward = providerRewards.pendingRewards;

        if (maxAmount != type(uint256).max && reward > maxAmount) {
            providerRewards.pendingRewards = reward - maxAmount;
        } else {
            providerRewards.pendingRewards = 0;
        }

        return reward;
    }

    /**
     * @dev returns whether the provided program is active
     */
    function _isProgramActive(ProgramData memory p) private view returns (bool) {
        uint32 currTime = _time();

        return p.id != 0 && p.startTime <= currTime && currTime <= p.endTime && _activeProgramIdByPool[p.pool] == p.id;
    }

    /**
     * @dev returns whether the provided program is active
     */
    function _isProgramEnabled(ProgramData memory p) private pure returns (bool) {
        return p.isEnabled;
    }

    /**
     * @dev returns whether or not a given program exists
     */
    function _doesProgramExist(ProgramData memory p) private pure returns (bool) {
        return address(p.pool) != address(0);
    }

    /**
     * @dev verifies that a program exists
     */
    function _verifyProgramExists(ProgramData memory p) private pure {
        if (!_doesProgramExist(p)) {
            revert ProgramDoesNotExist();
        }
    }

    /**
     * @dev verifies that a program exists and active
     */
    function _verifyProgramActive(ProgramData memory p) private view {
        _verifyProgramExists(p);

        if (!_isProgramActive(p)) {
            revert ProgramInactive();
        }
    }

    /**
     * @dev returns the remaining rewards of given program exists
     */
    function _remainingRewards(ProgramData memory p) private view returns (uint256) {
        return p.rewardRate * (p.endTime - _time());
    }

    /**
     * @dev updates program and provider's rewards
     */
    function _snapshotRewards(ProgramData memory p, address provider) private returns (ProviderRewards storage) {
        Rewards storage rewards = _programRewards[p.id];

        uint256 newRewardPerToken = _rewardPerToken(p, rewards);
        if (newRewardPerToken != rewards.rewardPerToken) {
            rewards.rewardPerToken = newRewardPerToken;
        }

        uint32 newUpdateTime = uint32(Math.min(_time(), p.endTime));
        if (newUpdateTime > rewards.lastUpdateTime) {
            rewards.lastUpdateTime = newUpdateTime;
        }

        ProviderRewards storage providerRewards = _providerRewards[provider];

        uint256 newPendingRewards = _pendingRewards(provider, p.id, newRewardPerToken, providerRewards);
        if (newPendingRewards != 0) {
            providerRewards.rewardPerTokenPaid = newRewardPerToken;
            providerRewards.pendingRewards = newPendingRewards;
        }

        return providerRewards;
    }

    /**
     * @dev calculates current reward per-token amount
     */
    function _rewardPerToken(ProgramData memory p, Rewards memory rewards) private view returns (uint256) {
        uint256 totalStaked = _programStakes[p.id];
        if (totalStaked == 0) {
            return rewards.rewardPerToken;
        }

        uint256 currTime = _time();
        if (currTime < p.startTime) {
            return 0;
        }

        uint256 stakingEndTime = Math.min(currTime, p.endTime);
        uint256 stakingStartTime = Math.max(p.startTime, rewards.lastUpdateTime);
        if (stakingStartTime == stakingEndTime) {
            return rewards.rewardPerToken;
        }

        return
            rewards.rewardPerToken +
            (((stakingEndTime - stakingStartTime) * p.rewardRate * REWARD_RATE_FACTOR) / totalStaked);
    }

    /**
     * @dev calculates provider's pending rewards
     */
    function _pendingRewards(
        address provider,
        uint256 id,
        uint256 updatedRewardPerToken,
        ProviderRewards memory providerRewards
    ) private view returns (uint256) {
        uint256 providerStake = _providerStakes[id][provider];

        return
            providerRewards.pendingRewards +
            (providerStake * (updatedRewardPerToken - providerRewards.rewardPerTokenPaid)) /
            REWARD_RATE_FACTOR;
    }

    /**
     * @dev distributes reward
     */
    function _distributeRewards(address recipient, RewardData memory rewardData) private {
        if (_isBNT(rewardData.pool)) {
            _bntGovernance.mint(recipient, rewardData.amount);
        } else {
            _externalRewardsVault.withdrawFunds(rewardData.rewardsToken, payable(recipient), rewardData.amount);
        }
    }

    /**
     * @dev returns whether the specified token is BNT
     */
    function _isBNT(Token token) private view returns (bool) {
        return token.isEqual(_bnt);
    }

    /**
     * @dev returns whether the provided array has duplicates
     */
    function _isArrayUnique(uint256[] calldata ids) private pure returns (bool) {
        if (ids.length <= 1) {
            return true;
        }

        for (uint256 i = 0; i < ids.length - 1; i++) {
            for (uint256 j = i + 1; j < ids.length; j++) {
                if (ids[i] == ids[j]) {
                    return false;
                }
            }
        }

        return true;
    }
}
