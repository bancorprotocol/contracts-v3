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

import { StakingRewardsMath } from "./StakingRewardsMath.sol";
import { IAutoCompoundingStakingRewards, ProgramData, DistributionType } from "./interfaces/IAutoCompoundingStakingRewards.sol";

/**
 * @dev Auto Compounding Staking Rewards contract
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

    struct PoolInfo {
        uint256 stakedBalance;
        uint256 protocolPoolTokenAmount;
        uint256 poolTokenTotalSupply;
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

    // the network token pool contract
    IMasterPool private immutable _masterPool;

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

        if (currentTime < currentProgram.startTime) {
            return false;
        }

        if (currentProgram.distributionType == DistributionType.FLAT) {
            // if the program end time has already passed
            if (currentTime > currentProgram.endTime) {
                return false;
            }
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

        if (!_networkSettings.isTokenWhitelisted(pool)) {
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

        // if a program already exists, process rewards for the last time before resetting it to ensure all rewards have
        // been distributed
        if (address(poolToken) != address(0)) {
            processRewards(pool);
        } else {
            // it no program exists for the given pool, initialize it
            if (poolAddress == address(_networkToken)) {
                poolToken = _masterPool.poolToken();
            } else {
                poolToken = _network.collectionByPool(pool).poolToken(pool);
            }
        }

        // check whether the rewards vault holds enough funds to cover the total rewards
        if (
            MathEx.mulDivF(
                poolToken.balanceOf(address(rewardsVault)),
                _network.collectionByPool(pool).poolLiquidity(pool).stakedBalance,
                poolToken.totalSupply()
            ) < totalRewards
        ) {
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

        // if the program is inactive, returns, except if it's flat distribution and
        // if its end time is lower than the previous distribution timestamp
        if (!isProgramActive(pool)) {
            if (
                distributionType == DistributionType.FLAT &&
                currentProgram.endTime < currentProgram.prevDistributionTimestamp
            ) {} else {
                return;
            }
        }

        PoolInfo memory poolInfo = _getPoolInfo(pool, currentProgram);
        TimeInfo memory timeInfo = _getTimeInfo(currentProgram);

        uint256 tokensToDistribute;
        if (distributionType == DistributionType.EXPONENTIAL_DECAY) {
            tokensToDistribute = calculateExponentialDecayRewards(currentProgram, timeInfo);
        } else if (distributionType == DistributionType.FLAT) {
            tokensToDistribute = calculateFlatRewards(currentProgram, timeInfo);
        }

        uint256 poolTokenToBurn = _calculatePoolTokenToBurn(
            poolInfo.stakedBalance,
            tokensToDistribute,
            poolInfo.poolTokenTotalSupply,
            poolInfo.protocolPoolTokenAmount
        );

        uint256 poolTokensInRewardsVault = currentProgram.poolToken.balanceOf(address(currentProgram.rewardsVault));

        // burn the least number of pool token between its balance in the rewards vault and the number of it supposed to
        // be burned
        currentProgram.rewardsVault.withdrawFunds(
            ReserveToken.wrap(address(currentProgram.poolToken)),
            payable(address(this)),
            Math.min(poolTokenToBurn, poolTokensInRewardsVault)
        );

        currentProgram.remainingRewards -= tokensToDistribute;
        currentProgram.prevDistributionTimestamp = timeInfo.currentTime;

        currentProgram.poolToken.burn(poolTokenToBurn);

        _programs[poolAddress] = currentProgram;

        emit RewardsDistributed(
            pool,
            tokensToDistribute,
            poolTokenToBurn,
            timeInfo.timeElapsed, // TODO
            currentProgram.remainingRewards
        );
    }

    /**
     * @dev returns the flat rewards
     */
    function calculateFlatRewards(ProgramData memory currentProgram, TimeInfo memory timeInfo)
        internal
        pure
        returns (uint256)
    {
        // cap the time elapsed to no more than the total duration of the program
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
    function calculateExponentialDecayRewards(ProgramData memory currentProgram, TimeInfo memory timeInfo)
        internal
        pure
        returns (uint256)
    {
        return
            _calculateExponentialDecayRewardsAfterTimeElapsed(timeInfo.timeElapsed, currentProgram.totalRewards) -
            _calculateExponentialDecayRewardsAfterTimeElapsed(timeInfo.prevTimeElapsed, currentProgram.totalRewards);
    }

    /**
     * @dev get a pool's information
     */
    function _getPoolInfo(ReserveToken pool, ProgramData memory currentProgram)
        internal
        view
        returns (PoolInfo memory)
    {
        PoolInfo memory poolInfo;

        if (pool.toIERC20() == _networkToken) {
            poolInfo.stakedBalance = _masterPool.stakedBalance();
            poolInfo.protocolPoolTokenAmount = currentProgram.poolToken.balanceOf(address(_masterPool));
        } else {
            poolInfo.stakedBalance = _network.collectionByPool(pool).poolLiquidity(pool).stakedBalance;
            poolInfo.protocolPoolTokenAmount = currentProgram.poolToken.balanceOf(address(currentProgram.rewardsVault));
        }
        poolInfo.poolTokenTotalSupply = currentProgram.poolToken.totalSupply();

        return poolInfo;
    }

    /**
     * @dev get a pool's time information
     */
    function _getTimeInfo(ProgramData memory currentProgram) internal view returns (TimeInfo memory) {
        TimeInfo memory timeInfo;

        timeInfo.currentTime = _time();

        timeInfo.timeElapsed = timeInfo.currentTime - currentProgram.startTime;

        timeInfo.prevTimeElapsed = uint32(
            MathEx.subMax0(currentProgram.prevDistributionTimestamp, currentProgram.startTime)
        );

        return timeInfo;
    }
}
