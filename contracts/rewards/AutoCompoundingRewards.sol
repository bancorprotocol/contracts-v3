// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, DoesNotExist, AlreadyExists, InvalidParam } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

import { INetworkSettings, NotWhitelisted } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IVault } from "../vaults/interfaces/IVault.sol";
import { IExternalRewardsVault } from "../vaults/interfaces/IExternalRewardsVault.sol";

// prettier-ignore
import {
    IAutoCompoundingRewards,
    ProgramData,
    FLAT_DISTRIBUTION,
    EXP_DECAY_DISTRIBUTION
} from "./interfaces/IAutoCompoundingRewards.sol";

import { RewardsMath } from "./RewardsMath.sol";

/**
 * @dev Auto-compounding Rewards contract
 */
contract AutoCompoundingRewards is IAutoCompoundingRewards, ReentrancyGuardUpgradeable, Utils, Time, Upgradeable {
    using TokenLibrary for Token;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    error InsufficientFunds();

    // the default number of programs to auto-process the rewards for
    uint8 private constant DEFAULT_AUTO_PROCESS_REWARDS_COUNT = 3;

    // the minimum time elapsed before the rewards of a program can be auto-processed
    uint16 private constant AUTO_PROCESS_REWARDS_MIN_TIME_DELTA = 1 hours;

    // the factor used to calculate the maximum number of programs to attempt to auto-process in a single attempt
    uint8 private constant AUTO_PROCESS_MAX_PROGRAMS_FACTOR = 2;

    // if a program is attempting to burn a total supply percentage equal or higher to this number,
    // the program will terminate
    uint32 private constant SUPPLY_BURN_TERMINATION_THRESHOLD_PPM = 500000;

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the BNT contract
    IERC20 private immutable _bnt;

    // the BNT pool contract
    IBNTPool private immutable _bntPool;

    // the BNT pool token contract
    IPoolToken private immutable _bntPoolToken;

    // the address of the external rewards vault
    IExternalRewardsVault private immutable _externalRewardsVault;

    // a mapping between pools and programs
    mapping(Token => ProgramData) private _programs;

    // a set of all pools that have a rewards program associated with them
    EnumerableSetUpgradeable.AddressSet private _pools;

    // the number of programs to auto-process the rewards for
    uint256 private _autoProcessRewardsCount;

    // the index of the next program to auto-process the rewards for
    uint256 internal _autoProcessRewardsIndex;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 5] private __gap;

    /**
     * @dev triggered when a flat program is created
     */
    event FlatProgramCreated(Token indexed pool, uint256 totalRewards, uint32 startTime, uint32 endTime);

    /**
     * @dev triggered when an exponential-decay program is created
     */
    event ExpDecayProgramCreated(Token indexed pool, uint256 totalRewards, uint32 startTime, uint32 halfLife);

    /**
     * @dev triggered when a program is terminated prematurely
     */
    event ProgramTerminated(Token indexed pool, uint32 endTime, uint256 remainingRewards);

    /**
     * @dev triggered when a program is paused/resumed
     */
    event ProgramPaused(Token indexed pool, bool paused);

    /**
     * @dev triggered when the number of programs to auto-process the rewards for is updated
     */
    event AutoProcessRewardsCountUpdated(uint256 prevCount, uint256 newCount);

    /**
     * @dev triggered when rewards are distributed
     */
    event RewardsDistributed(
        Token indexed pool,
        uint256 rewardsAmount,
        uint256 poolTokenAmount,
        uint256 remainingRewards
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initBNT,
        IBNTPool initBNTPool,
        IExternalRewardsVault initExternalRewardsVault
    )
        validAddress(address(initNetwork))
        validAddress(address(initNetworkSettings))
        validAddress(address(initBNT))
        validAddress(address(initBNTPool))
        validAddress(address(initExternalRewardsVault))
    {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _bnt = initBNT;
        _bntPool = initBNTPool;
        _bntPoolToken = initBNTPool.poolToken();
        _externalRewardsVault = initExternalRewardsVault;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __AutoCompoundingRewards_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __AutoCompoundingRewards_init() internal onlyInitializing {
        __ReentrancyGuard_init();
        __Upgradeable_init();

        __AutoCompoundingRewards_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __AutoCompoundingRewards_init_unchained() internal onlyInitializing {
        _setAutoProcessRewardsCount(DEFAULT_AUTO_PROCESS_REWARDS_COUNT);
    }

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function program(Token pool) external view returns (ProgramData memory) {
        return _programs[pool];
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function programs() external view returns (ProgramData[] memory) {
        uint256 numPrograms = _pools.length();

        ProgramData[] memory list = new ProgramData[](numPrograms);
        for (uint256 i = 0; i < numPrograms; i++) {
            list[i] = _programs[Token(_pools.at(i))];
        }

        return list;
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function pools() external view returns (address[] memory) {
        return _pools.values();
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function autoProcessRewardsCount() external view returns (uint256) {
        return _autoProcessRewardsCount;
    }

    /**
     * @dev sets the number of programs to auto-process the rewards for
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setAutoProcessRewardsCount(uint256 newCount) external greaterThanZero(newCount) onlyAdmin {
        _setAutoProcessRewardsCount(newCount);
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function isProgramActive(Token pool) external view returns (bool) {
        ProgramData memory p = _programs[pool];

        if (!_programExists(p)) {
            return false;
        }

        uint32 currTime = _time();

        if (p.distributionType == EXP_DECAY_DISTRIBUTION) {
            return p.startTime <= currTime;
        }

        return p.startTime <= currTime && currTime <= p.endTime;
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function isProgramPaused(Token pool) external view returns (bool) {
        return _programs[pool].isPaused;
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function createFlatProgram(
        Token pool,
        uint256 totalRewards,
        uint32 startTime,
        uint32 endTime
    ) external validAddress(address(pool)) greaterThanZero(totalRewards) onlyAdmin nonReentrant {
        if (startTime >= endTime) {
            revert InvalidParam();
        }

        _createProgram(pool, totalRewards, FLAT_DISTRIBUTION, startTime, endTime, 0);

        emit FlatProgramCreated({ pool: pool, totalRewards: totalRewards, startTime: startTime, endTime: endTime });
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function createExpDecayProgram(
        Token pool,
        uint256 totalRewards,
        uint32 startTime,
        uint32 halfLife
    ) external validAddress(address(pool)) greaterThanZero(totalRewards) onlyAdmin nonReentrant {
        if (halfLife == 0) {
            revert InvalidParam();
        }

        _createProgram(pool, totalRewards, EXP_DECAY_DISTRIBUTION, startTime, 0, halfLife);

        emit ExpDecayProgramCreated({
            pool: pool,
            totalRewards: totalRewards,
            startTime: startTime,
            halfLife: halfLife
        });
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function terminateProgram(Token pool) external onlyAdmin nonReentrant {
        _terminateProgram(pool);
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function pauseProgram(Token pool, bool pause) external onlyAdmin nonReentrant {
        ProgramData memory p = _programs[pool];

        if (!_programExists(p)) {
            revert DoesNotExist();
        }

        bool prevStatus = p.isPaused;
        if (prevStatus == pause) {
            return;
        }

        _programs[pool].isPaused = pause;

        emit ProgramPaused({ pool: pool, paused: pause });
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function autoProcessRewards() external nonReentrant {
        uint256 numOfPools = _pools.length();
        uint256 index = _autoProcessRewardsIndex;
        uint256 count = _autoProcessRewardsCount;
        uint256 maxCount = Math.min(count * AUTO_PROCESS_MAX_PROGRAMS_FACTOR, numOfPools);

        for (uint256 i = 0; i < maxCount; i++) {
            bool completed = _processRewards(Token(_pools.at(index % numOfPools)), true);
            index++;
            if (completed) {
                count--;
                if (count == 0) {
                    break;
                }
            }
        }

        _autoProcessRewardsIndex = index % numOfPools;
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function processRewards(Token pool) external nonReentrant {
        _processRewards(pool, false);
    }

    /**
     * @dev sets the number of programs to auto-process the rewards for
     */
    function _setAutoProcessRewardsCount(uint256 newCount) private {
        uint256 prevCount = _autoProcessRewardsCount;
        if (prevCount == newCount) {
            return;
        }

        _autoProcessRewardsCount = newCount;

        emit AutoProcessRewardsCountUpdated({ prevCount: prevCount, newCount: newCount });
    }

    /**
     * @dev processes the rewards of a given pool and returns true if the rewards processing was completed, and false
     * if it was skipped
     */
    function _processRewards(Token pool, bool skipRecent) private returns (bool) {
        ProgramData memory p = _programs[pool];

        uint32 currTime = _time();

        if (p.isPaused || currTime < p.startTime) {
            return false;
        }

        if (skipRecent && currTime < p.prevDistributionTimestamp + AUTO_PROCESS_REWARDS_MIN_TIME_DELTA) {
            return false;
        }

        uint256 tokenAmountToDistribute = _tokenAmountToDistribute(p, currTime);
        if (tokenAmountToDistribute == 0) {
            return true;
        }

        uint256 poolTokenAmountToBurn = _poolTokenAmountToBurn(pool, p, tokenAmountToDistribute);
        if (poolTokenAmountToBurn == 0) {
            return true;
        }

        // sanity check, if the amount to burn is equal or higher than the termination percentage
        // threshold, terminate the program
        if (
            poolTokenAmountToBurn * PPM_RESOLUTION >= p.poolToken.totalSupply() * SUPPLY_BURN_TERMINATION_THRESHOLD_PPM
        ) {
            _terminateProgram(pool);
            return false;
        }

        IVault rewardsVault = _rewardsVault(pool);
        _verifyFunds(poolTokenAmountToBurn, p.poolToken, rewardsVault);
        rewardsVault.burn(Token(address(p.poolToken)), poolTokenAmountToBurn);

        p.remainingRewards -= tokenAmountToDistribute;
        p.prevDistributionTimestamp = currTime;

        _programs[pool] = p;

        emit RewardsDistributed({
            pool: pool,
            rewardsAmount: tokenAmountToDistribute,
            poolTokenAmount: poolTokenAmountToBurn,
            remainingRewards: p.remainingRewards
        });

        return true;
    }

    /**
     * @dev creates a rewards program for a given pool
     */
    function _createProgram(
        Token pool,
        uint256 totalRewards,
        uint8 distributionType,
        uint32 startTime,
        uint32 endTime,
        uint32 halfLife
    ) private {
        if (_programExists(_programs[pool])) {
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

        if (startTime < _time()) {
            revert InvalidParam();
        }

        ProgramData memory p = ProgramData({
            startTime: startTime,
            endTime: endTime,
            halfLife: halfLife,
            prevDistributionTimestamp: 0,
            poolToken: poolToken,
            isPaused: false,
            distributionType: distributionType,
            totalRewards: totalRewards,
            remainingRewards: totalRewards
        });

        _verifyFunds(_poolTokenAmountToBurn(pool, p, totalRewards), poolToken, _rewardsVault(pool));

        _programs[pool] = p;

        assert(_pools.add(address(pool)));
    }

    /**
     * @dev terminates a rewards program
     */
    function _terminateProgram(Token pool) private {
        ProgramData memory p = _programs[pool];

        if (!_programExists(p)) {
            revert DoesNotExist();
        }

        delete _programs[pool];

        assert(_pools.remove(address(pool)));

        emit ProgramTerminated({ pool: pool, endTime: p.endTime, remainingRewards: p.remainingRewards });
    }

    /**
     * @dev returns the amount of tokens to distribute
     */
    function _tokenAmountToDistribute(ProgramData memory p, uint32 currTime) private pure returns (uint256) {
        uint32 prevTime = uint32(Math.max(p.prevDistributionTimestamp, p.startTime));

        if (p.distributionType == FLAT_DISTRIBUTION) {
            uint32 currTimeElapsed = uint32(Math.min(currTime, p.endTime)) - p.startTime;
            uint32 prevTimeElapsed = uint32(Math.min(prevTime, p.endTime)) - p.startTime;
            return
                RewardsMath.calcFlatRewards(p.totalRewards, currTimeElapsed - prevTimeElapsed, p.endTime - p.startTime);
        } else {
            uint32 currTimeElapsed = currTime - p.startTime;
            uint32 prevTimeElapsed = prevTime - p.startTime;
            return
                RewardsMath.calcExpDecayRewards(p.totalRewards, currTimeElapsed, p.halfLife) -
                RewardsMath.calcExpDecayRewards(p.totalRewards, prevTimeElapsed, p.halfLife);
        }
    }

    /**
     * @dev returns the amount of pool tokens to burn
     */
    function _poolTokenAmountToBurn(
        Token pool,
        ProgramData memory p,
        uint256 tokenAmountToDistribute
    ) private view returns (uint256) {
        if (pool.isEqual(_bnt)) {
            return _bntPool.poolTokenAmountToBurn(tokenAmountToDistribute);
        }

        return
            _network.collectionByPool(pool).poolTokenAmountToBurn(
                pool,
                tokenAmountToDistribute,
                p.poolToken.balanceOf(address(_externalRewardsVault))
            );
    }

    /**
     * @dev returns whether or not a given program exists
     */
    function _programExists(ProgramData memory p) private pure returns (bool) {
        return address(p.poolToken) != address(0);
    }

    /**
     * @dev returns the rewards vault for a given pool
     */
    function _rewardsVault(Token pool) private view returns (IVault) {
        return pool.isEqual(_bnt) ? IVault(_bntPool) : IVault(_externalRewardsVault);
    }

    /**
     * @dev verifies that the rewards vault holds a sufficient amount of pool tokens
     */
    function _verifyFunds(
        uint256 requiredAmount,
        IPoolToken poolToken,
        IVault rewardsVault
    ) private view {
        if (requiredAmount > poolToken.balanceOf(address(rewardsVault))) {
            revert InsufficientFunds();
        }
    }
}
