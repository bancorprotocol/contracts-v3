// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { uncheckedInc, MathEx } from "../utility/MathEx.sol";
import { Utils, NotWhitelisted } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";
import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";
import { IVault } from "../vaults/interfaces/IVault.sol";

import { IAutoCompoundingStakingRewards, ProgramData, DistributionType } from "./interfaces/IAutoCompoundingStakingRewards.sol";

import { StakingRewardsMath } from "./StakingRewardsMath.sol";

/**
 * @dev Auto-compounding Staking Rewards contract
 */
contract AutoCompoundingStakingRewards is
    IAutoCompoundingStakingRewards,
    StakingRewardsMath,
    ReentrancyGuardUpgradeable,
    Utils,
    Time,
    Upgradeable
{
    using ReserveTokenLibrary for ReserveToken;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    struct TimeInfo {
        uint32 timeElapsed;
        uint32 prevTimeElapsed;
        uint32 currentTime;
    }

    error ProgramActive();
    error ProgramInactive();
    error ProgramAlreadyActive();
    error InvalidParam();
    error InsufficientFunds();

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the network token contract
    IERC20 private immutable _networkToken;

    // the master pool contract
    IMasterPool private immutable _masterPool;

    // the master pool took contract
    IPoolToken private immutable _masterPoolToken;

    // a mapping between a pool address and a program
    mapping(address => ProgramData) private _programs;

    // a map of all pools that have a rewards program associated with them
    EnumerableSetUpgradeable.AddressSet private _programByPool;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 3] private __gap;

    /**
     * @dev triggered when a program is created
     */
    event ProgramCreated(
        ReserveToken indexed pool,
        IVault rewardsVault,
        uint256 totalRewards,
        DistributionType indexed distributionType,
        uint256 startTime,
        uint256 endTime
    );

    /**
     * @dev triggered when a program is terminated prematurely
     */
    event ProgramTerminated(ReserveToken indexed pool, uint32 prevEndTime, uint256 remainingRewards);

    /**
     * @dev triggered when a program is enabled/disabled
     */
    event ProgramEnabled(ReserveToken indexed pool, bool status, uint256 remainingRewards);

    /**
     * @dev triggered when rewards are distributed
     */
    event RewardsDistributed(
        ReserveToken indexed pool,
        uint256 rewardsAmount,
        uint256 poolTokenAmount,
        uint32 programTimeElapsed,
        uint256 remainingRewards
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initNetworkToken,
        IMasterPool initMasterPool
    )
        validAddress(address(initNetwork))
        validAddress(address(initNetworkSettings))
        validAddress(address(initNetworkToken))
        validAddress(address(initMasterPool))
    {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _networkToken = initNetworkToken;
        _masterPool = initMasterPool;
        _masterPoolToken = initMasterPool.poolToken();
    }

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
        __ReentrancyGuard_init();
        __Upgradeable_init();

        __AutoCompoundingStakingRewards_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __AutoCompoundingStakingRewards_init_unchained() internal initializer {}

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function program(ReserveToken pool) external view returns (ProgramData memory) {
        return _programs[ReserveToken.unwrap(pool)];
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function programs() external view returns (ProgramData[] memory) {
        uint256 numPrograms = _programByPool.length();

        ProgramData[] memory list = new ProgramData[](numPrograms);
        for (uint256 i = 0; i < numPrograms; i = uncheckedInc(i)) {
            list[i] = _programs[_programByPool.at(i)];
        }

        return list;
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function isProgramActive(ReserveToken pool) public view returns (bool) {
        ProgramData memory currentProgram = _programs[ReserveToken.unwrap(pool)];

        if (currentProgram.remainingRewards == 0) {
            return false;
        }

        uint256 currentTime = _time();

        // if the program hasn't started yet
        if (currentTime < currentProgram.startTime) {
            return false;
        }

        // if a flat distribution program has already finished
        if (currentProgram.distributionType == DistributionType.FLAT && currentTime > currentProgram.endTime) {
            return false;
        }

        return true;
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function createProgram(
        ReserveToken pool,
        IVault rewardsVault,
        uint256 totalRewards,
        DistributionType distributionType,
        uint32 startTime,
        uint32 endTime
    ) external validAddress(address(ReserveToken.unwrap(pool))) validAddress(address(rewardsVault)) onlyAdmin {
        if (isProgramActive(pool)) {
            revert ProgramAlreadyActive();
        }

        bool isNetworkToken = _isNetworkToken(pool);
        if (isNetworkToken) {
            if (rewardsVault != _masterPool) {
                revert InvalidParam();
            }
        } else if (!_networkSettings.isTokenWhitelisted(pool)) {
            revert NotWhitelisted();
        }

        if (totalRewards == 0) {
            revert InvalidParam();
        }

        if (startTime < _time()) {
            revert InvalidParam();
        }

        if (distributionType == DistributionType.FLAT) {
            if (startTime > endTime || endTime == 0) {
                revert InvalidParam();
            }
        } else if (distributionType == DistributionType.EXPONENTIAL_DECAY) {
            if (endTime != 0) {
                revert InvalidParam();
            }
        }

        address poolAddress = ReserveToken.unwrap(pool);
        IPoolToken poolToken = _programs[poolAddress].poolToken;
        bool programExists = address(poolToken) != address(0);
        uint256 requiredPoolTokenAmount;

        if (isNetworkToken) {
            poolToken = programExists ? poolToken : _masterPoolToken;
            requiredPoolTokenAmount = _masterPool.underlyingToPoolToken(totalRewards);
        } else {
            IPoolCollection poolCollection = _network.collectionByPool(pool);
            poolToken = programExists ? poolToken : poolCollection.poolToken(pool);
            requiredPoolTokenAmount = poolCollection.underlyingToPoolToken(pool, totalRewards);
        }

        // if a program already exists, process rewards for the last time before resetting it to ensure all rewards have
        // been distributed
        if (programExists) {
            processRewards(pool);
        }

        // check whether the rewards vault holds enough funds to cover the total rewards
        if (requiredPoolTokenAmount > poolToken.balanceOf(address(rewardsVault))) {
            revert InsufficientFunds();
        }

        _programs[poolAddress] = ProgramData({
            startTime: startTime,
            endTime: endTime,
            prevDistributionTimestamp: 0,
            totalRewards: totalRewards,
            remainingRewards: totalRewards,
            rewardsVault: rewardsVault,
            poolToken: poolToken,
            isEnabled: true,
            distributionType: distributionType
        });

        _programByPool.add(poolAddress);

        emit ProgramCreated(pool, rewardsVault, totalRewards, distributionType, startTime, endTime);
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function terminateProgram(ReserveToken pool) external onlyAdmin {
        if (!isProgramActive(pool)) {
            revert ProgramInactive();
        }

        ProgramData storage currentProgram = _programs[ReserveToken.unwrap(pool)];

        currentProgram.endTime = _time();

        uint256 cachedRemainingRewards = currentProgram.remainingRewards;
        currentProgram.remainingRewards = 0;

        emit ProgramTerminated(pool, currentProgram.endTime, cachedRemainingRewards);
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function enableProgram(ReserveToken pool, bool status) external onlyAdmin {
        ProgramData storage currentProgram = _programs[ReserveToken.unwrap(pool)];

        bool prevStatus = currentProgram.isEnabled;
        if (prevStatus == status) {
            return;
        }

        currentProgram.isEnabled = status;

        emit ProgramEnabled(pool, status, currentProgram.remainingRewards);
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function processRewards(ReserveToken pool) public nonReentrant {
        address poolAddress = ReserveToken.unwrap(pool);
        ProgramData memory currentProgram = _programs[poolAddress];

        DistributionType distributionType = currentProgram.distributionType;

        // if program is disabled, don't process rewards
        if (!currentProgram.isEnabled) {
            return;
        }

        // if the program is inactive, don't process rewards. The only exception is if it's a flat distribution program
        // whose rewards weren't distributed yet in full
        if (!isProgramActive(pool)) {
            if (
                distributionType == DistributionType.FLAT &&
                currentProgram.endTime < _time() &&
                currentProgram.prevDistributionTimestamp < currentProgram.endTime
            ) {} else {
                return;
            }
        }

        TimeInfo memory timeInfo = _getTimeInfo(currentProgram);

        uint256 tokenAmountToDistribute;
        if (distributionType == DistributionType.EXPONENTIAL_DECAY) {
            tokenAmountToDistribute = _calculateExponentialDecayRewards(currentProgram, timeInfo);
        } else if (distributionType == DistributionType.FLAT) {
            tokenAmountToDistribute = _calculateFlatRewards(currentProgram, timeInfo);
        }

        if (tokenAmountToDistribute == 0) {
            return;
        }

        uint256 poolTokenAmountToBurn;
        if (_isNetworkToken(pool)) {
            poolTokenAmountToBurn = _masterPool.poolTokenAmountToBurn(tokenAmountToDistribute);
        } else {
            uint256 protocolPoolTokenAmount = currentProgram.poolToken.balanceOf(address(currentProgram.rewardsVault));

            // burn the least number of pool token between its balance in the rewards vault and the number of it
            // supposed to be burned
            IPoolCollection poolCollection = _network.collectionByPool(pool);
            poolTokenAmountToBurn = Math.min(
                poolCollection.poolTokenAmountToBurn(pool, tokenAmountToDistribute, protocolPoolTokenAmount),
                protocolPoolTokenAmount
            );
        }

        if (poolTokenAmountToBurn == 0) {
            return;
        }

        currentProgram.remainingRewards -= tokenAmountToDistribute;
        currentProgram.prevDistributionTimestamp = timeInfo.currentTime;

        currentProgram.rewardsVault.withdrawFunds(
            ReserveToken.wrap(address(currentProgram.poolToken)),
            payable(address(this)),
            poolTokenAmountToBurn
        );

        currentProgram.poolToken.burn(poolTokenAmountToBurn);

        _programs[poolAddress] = currentProgram;

        emit RewardsDistributed(
            pool,
            tokenAmountToDistribute,
            poolTokenAmountToBurn,
            timeInfo.timeElapsed,
            currentProgram.remainingRewards
        );
    }

    /**
     * @dev returns the flat rewards
     */
    function _calculateFlatRewards(ProgramData memory currentProgram, TimeInfo memory timeInfo)
        private
        pure
        returns (uint256)
    {
        // ensure that the elapsed time isn't longer than the duration of the program
        uint32 programDuration = currentProgram.endTime - currentProgram.startTime;
        uint32 timeElapsed = uint32(Math.min(timeInfo.timeElapsed, programDuration));

        uint32 timeElapsedSinceLastDistribution = timeElapsed - timeInfo.prevTimeElapsed;
        uint32 remainingProgramDuration = programDuration - timeInfo.prevTimeElapsed;

        return
            _calculateFlatRewards(
                timeElapsedSinceLastDistribution,
                remainingProgramDuration,
                currentProgram.remainingRewards
            );
    }

    /**
     * @dev returns the exponential decay rewards
     */
    function _calculateExponentialDecayRewards(ProgramData memory currentProgram, TimeInfo memory timeInfo)
        private
        pure
        returns (uint256)
    {
        return
            _calculateExponentialDecayRewardsAfterTimeElapsed(timeInfo.timeElapsed, currentProgram.totalRewards) -
            _calculateExponentialDecayRewardsAfterTimeElapsed(timeInfo.prevTimeElapsed, currentProgram.totalRewards);
    }

    /**
     * @dev get a pool's time information
     */
    function _getTimeInfo(ProgramData memory currentProgram) private view returns (TimeInfo memory) {
        uint32 currentTime = _time();
        uint32 timeElapsed = currentTime - currentProgram.startTime;

        // if this is a flat distribution program, // ensure that the elapsed time isn't longer than the duration of the
        // program
        if (currentProgram.distributionType == DistributionType.FLAT) {
            timeElapsed = uint32(Math.min(timeElapsed, currentProgram.endTime - currentProgram.startTime));
        }

        return
            TimeInfo({
                currentTime: currentTime,
                timeElapsed: timeElapsed,
                prevTimeElapsed: uint32(
                    MathEx.subMax0(currentProgram.prevDistributionTimestamp, currentProgram.startTime)
                )
            });
    }

    /**
     * @dev returns whether the specified token is the network token
     */
    function _isNetworkToken(ReserveToken token) private view returns (bool) {
        return token.toIERC20() == _networkToken;
    }
}
