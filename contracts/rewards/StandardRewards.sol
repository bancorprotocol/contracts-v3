// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Address } from "@openzeppelin/contracts/utils/Address.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, DoesNotExist, AlreadyExists, InvalidParam } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

import { INetworkSettings, NotWhitelisted } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IStandardRewards, ProgramData, Rewards, ProviderRewards, StakeAmounts } from "./interfaces/IStandardRewards.sol";

/**
 * @dev Standard Rewards contract
 */
contract StandardRewards is IStandardRewards, ReentrancyGuardUpgradeable, Utils, Time, Upgradeable {
    using Address for address payable;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
    using TokenLibrary for Token;
    using SafeERC20 for IERC20;

    struct ClaimData {
        uint256 reward;
        uint256 stakedAmount;
    }

    error ArrayNotUnique();
    error NativeTokenAmountMismatch();
    error RewardsTooHigh();
    error ProgramInactive();
    error ProgramSuspended();

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

    // the vBNT contract
    IERC20 private immutable _vbnt;

    // the BNT pool token contract
    IPoolToken private immutable _bntPoolToken;

    // the ID of the next created program
    uint256 internal _nextProgramId;

    // a mapping between providers and the program IDs of the program they are participating in
    mapping(address => EnumerableSetUpgradeable.UintSet) private _programIdsByProvider;

    // a mapping between program IDs and program data
    mapping(uint256 => ProgramData) internal _programs;

    // a mapping between pools and their latest programs
    mapping(Token => uint256) private _latestProgramIdByPool;

    // a mapping between programs and their respective rewards data
    mapping(uint256 => Rewards) internal _programRewards;

    // a mapping between providers, programs and their respective rewards data
    mapping(address => mapping(uint256 => ProviderRewards)) internal _providerRewards;

    // a mapping between programs and their total stakes
    mapping(uint256 => uint256) private _programStakes;

    // DEPRECATED (mapping(Token => uint256) internal _unclaimedRewards)
    uint256 private _deprecated0;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 8] private __gap;

    /**
     * @dev triggered when a program is created
     */
    event ProgramCreated(
        Token indexed pool,
        uint256 indexed programId,
        Token indexed rewardsToken,
        uint256 totalRewards,
        uint32 startTime,
        uint32 endTime
    );

    /**
     * @dev triggered when a program is terminated prematurely
     */
    event ProgramTerminated(Token indexed pool, uint256 indexed programId, uint32 endTime);

    /**
     * @dev triggered when a program is paused/resumed
     */
    event ProgramPaused(Token indexed pool, uint256 indexed programId, bool paused);

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
        IERC20 initVBNT,
        IBNTPool initBNTPool
    )
        validAddress(address(initNetwork))
        validAddress(address(initNetworkSettings))
        validAddress(address(initBNTGovernance))
        validAddress(address(initVBNT))
        validAddress(address(initBNTPool))
    {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _bntGovernance = initBNTGovernance;
        _bnt = initBNTGovernance.token();
        _vbnt = initVBNT;
        _bntPoolToken = initBNTPool.poolToken();
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __StandardRewards_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __StandardRewards_init() internal onlyInitializing {
        __ReentrancyGuard_init();
        __Upgradeable_init();

        __StandardRewards_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __StandardRewards_init_unchained() internal onlyInitializing {
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
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 4;
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function programIds() external view returns (uint256[] memory) {
        uint256 length = _nextProgramId - INITIAL_PROGRAM_ID;
        uint256[] memory ids = new uint256[](length);
        for (uint256 i = 0; i < length; i++) {
            ids[i] = i + INITIAL_PROGRAM_ID;
        }

        return ids;
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function programs(uint256[] calldata ids) external view uniqueArray(ids) returns (ProgramData[] memory) {
        uint256 length = ids.length;
        ProgramData[] memory list = new ProgramData[](length);

        for (uint256 i = 0; i < length; i++) {
            list[i] = _programs[ids[i]];
        }

        return list;
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function providerProgramIds(address provider) external view returns (uint256[] memory) {
        return _programIdsByProvider[provider].values();
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function programRewards(uint256 id) external view returns (Rewards memory) {
        return _programRewards[id];
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function providerRewards(address provider, uint256 id) external view returns (ProviderRewards memory) {
        return _providerRewards[provider][id];
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function programStake(uint256 id) external view returns (uint256) {
        return _programStakes[id];
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function providerStake(address provider, uint256 id) external view returns (uint256) {
        return _providerRewards[provider][id].stakedAmount;
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function isProgramActive(uint256 id) external view returns (bool) {
        return _isProgramActive(_programs[id]);
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function isProgramPaused(uint256 id) external view returns (bool) {
        return _isProgramPaused(_programs[id]);
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function latestProgramId(Token pool) external view returns (uint256) {
        return _latestProgramIdByPool[pool];
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function createProgram(
        Token pool,
        uint256 totalRewards,
        uint32 startTime,
        uint32 endTime
    ) external validAddress(address(pool)) greaterThanZero(totalRewards) onlyAdmin nonReentrant returns (uint256) {
        if (!(_time() <= startTime && startTime < endTime)) {
            revert InvalidParam();
        }

        // ensure that no program exists for the specific pool
        if (_isProgramActive(_programs[_latestProgramIdByPool[pool]])) {
            revert AlreadyExists();
        }

        IPoolToken poolToken;
        if (pool.isEqual(_bnt)) {
            poolToken = _bntPoolToken;
        } else {
            if (!_networkSettings.isTokenWhitelisted(pool)) {
                revert NotWhitelisted();
            }

            poolToken = _network.collectionByPool(pool).poolToken(pool);
        }

        uint256 id = _nextProgramId++;
        uint256 rewardRate = totalRewards / (endTime - startTime);

        _programs[id] = ProgramData({
            id: id,
            pool: pool,
            poolToken: poolToken,
            rewardsToken: Token(address(_bnt)),
            isPaused: false,
            startTime: startTime,
            endTime: endTime,
            rewardRate: rewardRate,
            remainingRewards: rewardRate * (endTime - startTime)
        });

        // set the program as the latest program of the pool
        _latestProgramIdByPool[pool] = id;

        emit ProgramCreated({
            pool: pool,
            programId: id,
            rewardsToken: Token(address(_bnt)),
            totalRewards: totalRewards,
            startTime: startTime,
            endTime: endTime
        });

        return id;
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function terminateProgram(uint256 id) external onlyAdmin {
        ProgramData storage p = _programs[id];

        _verifyProgramActive(p);

        // unset the program from being the latest program of the pool
        delete _latestProgramIdByPool[p.pool];

        uint32 endTime = p.endTime;

        // reduce the remaining rewards for the token by the remaining rewards and stop rewards accumulation
        p.remainingRewards -= _remainingRewards(p);
        p.endTime = _time();

        emit ProgramTerminated(p.pool, id, endTime);
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function pauseProgram(uint256 id, bool pause) external onlyAdmin {
        ProgramData storage p = _programs[id];

        _verifyProgramExists(p);

        bool prevStatus = p.isPaused;
        if (prevStatus == pause) {
            return;
        }

        p.isPaused = pause;

        emit ProgramPaused({ pool: p.pool, programId: id, paused: pause });
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function join(uint256 id, uint256 poolTokenAmount) external greaterThanZero(poolTokenAmount) nonReentrant {
        ProgramData memory p = _programs[id];

        _verifyProgramActiveAndNotPaused(p);

        _join(msg.sender, p, poolTokenAmount, msg.sender);
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function leave(uint256 id, uint256 poolTokenAmount) external greaterThanZero(poolTokenAmount) nonReentrant {
        ProgramData memory p = _programs[id];

        _verifyProgramExists(p);

        _leave(msg.sender, p, poolTokenAmount);
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function depositAndJoin(
        uint256 id,
        uint256 tokenAmount
    ) external payable greaterThanZero(tokenAmount) nonReentrant {
        ProgramData memory p = _programs[id];

        _verifyProgramActiveAndNotPaused(p);

        _depositAndJoin(msg.sender, p, tokenAmount);
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function pendingRewards(address provider, uint256[] calldata ids) external view uniqueArray(ids) returns (uint256) {
        uint256 reward = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            uint256 id = ids[i];

            ProgramData memory p = _programs[id];

            _verifyProgramExists(p);

            uint256 newRewardPerToken = _rewardPerToken(p, _programRewards[id]);
            ProviderRewards memory providerRewardsData = _providerRewards[provider][id];

            reward += _pendingRewards(newRewardPerToken, providerRewardsData);
        }

        return reward;
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function claimRewards(uint256[] calldata ids) external uniqueArray(ids) nonReentrant returns (uint256) {
        uint256 reward = _claimRewards(msg.sender, ids, false);

        if (reward == 0) {
            return 0;
        }

        _bntGovernance.mint(msg.sender, reward);

        return reward;
    }

    /**
     * @inheritdoc IStandardRewards
     */
    function stakeRewards(uint256[] calldata ids) external uniqueArray(ids) nonReentrant returns (StakeAmounts memory) {
        uint256 reward = _claimRewards(msg.sender, ids, true);

        if (reward == 0) {
            return StakeAmounts({ stakedRewardAmount: 0, poolTokenAmount: 0 });
        }

        _bntGovernance.mint(address(this), reward);

        // deposit provider's tokens to the network. Please note, that since we're staking rewards, then the deposit
        // should come from the contract itself, but the pool tokens should be sent to the provider directly
        uint256 poolTokenAmount = _deposit(msg.sender, address(this), false, Token(address(_bnt)), reward);

        return StakeAmounts({ stakedRewardAmount: reward, poolTokenAmount: poolTokenAmount });
    }

    /**
     * @dev adds provider's stake to the program
     */
    function _join(address provider, ProgramData memory p, uint256 poolTokenAmount, address payer) private {
        // take a snapshot of the existing rewards (before increasing the stake)
        ProviderRewards storage data = _snapshotRewards(p, provider);

        // update both program and provider stakes
        _programStakes[p.id] += poolTokenAmount;

        uint256 prevStake = data.stakedAmount;
        data.stakedAmount = prevStake + poolTokenAmount;

        // unless the payer is the contract itself (in which case, no additional transfer is required), transfer the
        // tokens from the payer (we aren't using safeTransferFrom, since the PoolToken is a fully compliant ERC20 token
        // contract)
        if (payer != address(this)) {
            p.poolToken.transferFrom(payer, address(this), poolTokenAmount);
        }

        // add the program to the provider's program list
        _programIdsByProvider[provider].add(p.id);

        emit ProviderJoined({
            pool: p.pool,
            programId: p.id,
            provider: provider,
            poolTokenAmount: poolTokenAmount,
            prevStake: prevStake
        });
    }

    /**
     * @dev removes (some of) provider's stake from the program
     */
    function _leave(address provider, ProgramData memory p, uint256 poolTokenAmount) private {
        // take a snapshot of the existing rewards (before decreasing the stake)
        ProviderRewards storage data = _snapshotRewards(p, provider);

        // update both program and provider stakes
        _programStakes[p.id] -= poolTokenAmount;

        uint256 remainingStake = data.stakedAmount - poolTokenAmount;
        data.stakedAmount = remainingStake;

        // transfer the tokens to the provider (we aren't using safeTransfer, since the PoolToken is a fully
        // compliant ERC20 token contract)
        p.poolToken.transfer(provider, poolTokenAmount);

        // if the provider has removed all of its stake and there are no pending rewards - remove the program from the
        // provider's program list
        if (remainingStake == 0 && data.pendingRewards == 0) {
            _programIdsByProvider[provider].remove(p.id);
        }

        emit ProviderLeft({
            pool: p.pool,
            programId: p.id,
            provider: provider,
            poolTokenAmount: poolTokenAmount,
            remainingStake: remainingStake
        });
    }

    /**
     * @dev deposits provider's stake to the network and returns the received pool token amount
     */
    function _deposit(
        address provider,
        address payer,
        bool keepPoolTokens,
        Token pool,
        uint256 tokenAmount
    ) private returns (uint256) {
        uint256 poolTokenAmount;
        address recipient = keepPoolTokens ? address(this) : provider;
        bool externalPayer = payer != address(this);

        if (pool.isNative()) {
            // unless the payer is the contract itself (e.g., during the staking process), in which case the native token
            // was already claimed and pending in the contract - verify and use the received native token from the sender
            if (externalPayer) {
                if (msg.value < tokenAmount) {
                    revert NativeTokenAmountMismatch();
                }
            }

            poolTokenAmount = _network.depositFor{ value: tokenAmount }(recipient, pool, tokenAmount);

            // refund the caller for the remaining native token amount
            if (externalPayer && msg.value > tokenAmount) {
                payable(address(payer)).sendValue(msg.value - tokenAmount);
            }
        } else {
            if (msg.value > 0) {
                revert NativeTokenAmountMismatch();
            }

            // unless the payer is the contract itself (e.g., during the staking process), in which case the tokens were
            // already claimed and pending in the contract - get the tokens from the provider
            if (externalPayer) {
                pool.safeTransferFrom(payer, address(this), tokenAmount);
            }

            pool.ensureApprove(address(_network), tokenAmount);
            poolTokenAmount = _network.depositFor(recipient, pool, tokenAmount);

            if (keepPoolTokens && pool.isEqual(_bnt)) {
                _vbnt.safeTransfer(provider, poolTokenAmount);
            }
        }

        return poolTokenAmount;
    }

    /**
     * @dev deposits and adds provider's stake to the program
     */
    function _depositAndJoin(address provider, ProgramData memory p, uint256 tokenAmount) private {
        // deposit provider's tokens to the network and let the contract itself to claim the pool tokens so that it can
        // immediately add them to a program
        uint256 poolTokenAmount = _deposit(provider, provider, true, p.pool, tokenAmount);

        // join the existing program, but ensure not to attempt to transfer the tokens from the provider by setting the
        // payer as the contract itself
        _join(provider, p, poolTokenAmount, address(this));
    }

    /**
     * @dev claims rewards
     */
    function _claimRewards(address provider, uint256[] calldata ids, bool stake) private returns (uint256) {
        uint256 reward = 0;

        for (uint256 i = 0; i < ids.length; i++) {
            ProgramData memory p = _programs[ids[i]];

            _verifyProgramNotPaused(p);

            ClaimData memory claimData = _claimRewards(provider, p);

            if (claimData.reward > 0) {
                uint256 remainingRewards = p.remainingRewards;

                // a sanity check that the reward amount doesn't exceed the remaining rewards per program
                if (remainingRewards < claimData.reward) {
                    revert RewardsTooHigh();
                }

                // decrease the remaining rewards per program
                _programs[ids[i]].remainingRewards = remainingRewards - claimData.reward;

                // collect same-reward token rewards
                reward += claimData.reward;
            }

            // if the program is no longer active, has no stake left, and there are no pending rewards - remove the
            // program from the provider's program list
            if (!_isProgramActive(p) && claimData.stakedAmount == 0) {
                _programIdsByProvider[provider].remove(p.id);
            }

            if (stake) {
                emit RewardsStaked({ pool: p.pool, programId: p.id, provider: provider, amount: claimData.reward });
            } else {
                emit RewardsClaimed({ pool: p.pool, programId: p.id, provider: provider, amount: claimData.reward });
            }
        }

        return reward;
    }

    /**
     * @dev claims rewards and returns the received and the pending reward amounts
     */
    function _claimRewards(address provider, ProgramData memory p) internal returns (ClaimData memory) {
        ProviderRewards storage providerRewardsData = _snapshotRewards(p, provider);

        uint256 reward = providerRewardsData.pendingRewards;

        providerRewardsData.pendingRewards = 0;

        return ClaimData({ reward: reward, stakedAmount: providerRewardsData.stakedAmount });
    }

    /**
     * @dev returns whether the specified program is active
     */
    function _isProgramActive(ProgramData memory p) private view returns (bool) {
        uint32 currTime = _time();

        return
            _programExists(p) &&
            p.startTime <= currTime &&
            currTime <= p.endTime &&
            _latestProgramIdByPool[p.pool] == p.id;
    }

    /**
     * @dev returns whether the specified program is paused
     */
    function _isProgramPaused(ProgramData memory p) private pure returns (bool) {
        return p.isPaused;
    }

    /**
     * @dev returns whether or not a given program exists
     */
    function _programExists(ProgramData memory p) private pure returns (bool) {
        return address(p.pool) != address(0);
    }

    /**
     * @dev verifies that a program exists
     */
    function _verifyProgramExists(ProgramData memory p) private pure {
        if (!_programExists(p)) {
            revert DoesNotExist();
        }
    }

    /**
     * @dev verifies that a program exists, and active
     */
    function _verifyProgramActive(ProgramData memory p) private view {
        _verifyProgramExists(p);

        if (!_isProgramActive(p)) {
            revert ProgramInactive();
        }
    }

    /**
     * @dev verifies that a program is not paused
     */
    function _verifyProgramNotPaused(ProgramData memory p) private pure {
        _verifyProgramExists(p);

        if (p.isPaused) {
            revert ProgramSuspended();
        }
    }

    /**
     * @dev verifies that a program exists, active, and not paused
     */
    function _verifyProgramActiveAndNotPaused(ProgramData memory p) private view {
        _verifyProgramActive(p);
        _verifyProgramNotPaused(p);
    }

    /**
     * @dev returns the remaining rewards of given program
     */
    function _remainingRewards(ProgramData memory p) private view returns (uint256) {
        uint32 currTime = _time();

        return p.endTime > currTime ? p.rewardRate * (p.endTime - currTime) : 0;
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
        if (rewards.lastUpdateTime < newUpdateTime) {
            rewards.lastUpdateTime = newUpdateTime;
        }

        ProviderRewards storage providerRewardsData = _providerRewards[provider][p.id];

        uint256 newPendingRewards = _pendingRewards(newRewardPerToken, providerRewardsData);
        if (newPendingRewards != 0) {
            providerRewardsData.pendingRewards = newPendingRewards;
        }

        providerRewardsData.rewardPerTokenPaid = newRewardPerToken;

        return providerRewardsData;
    }

    /**
     * @dev calculates current reward per-token amount
     */
    function _rewardPerToken(ProgramData memory p, Rewards memory rewards) private view returns (uint256) {
        uint256 currTime = _time();
        if (currTime < p.startTime) {
            return 0;
        }

        uint256 totalStaked = _programStakes[p.id];
        if (totalStaked == 0) {
            return rewards.rewardPerToken;
        }

        uint256 stakingEndTime = Math.min(currTime, p.endTime);
        uint256 stakingStartTime = Math.max(p.startTime, rewards.lastUpdateTime);

        return
            rewards.rewardPerToken +
            (((stakingEndTime - stakingStartTime) * p.rewardRate * REWARD_RATE_FACTOR) / totalStaked);
    }

    /**
     * @dev calculates provider's pending rewards
     */
    function _pendingRewards(
        uint256 updatedRewardPerToken,
        ProviderRewards memory providerRewardsData
    ) private pure returns (uint256) {
        return
            providerRewardsData.pendingRewards +
            (providerRewardsData.stakedAmount * (updatedRewardPerToken - providerRewardsData.rewardPerTokenPaid)) /
            REWARD_RATE_FACTOR;
    }

    /**
     * @dev returns whether the specified array has duplicates
     */
    function _isArrayUnique(uint256[] calldata ids) private pure returns (bool) {
        for (uint256 i = 0; i < ids.length; i++) {
            for (uint256 j = i + 1; j < ids.length; j++) {
                if (ids[i] == ids[j]) {
                    return false;
                }
            }
        }

        return true;
    }
}
