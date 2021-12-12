// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { uncheckedInc, MathEx } from "../utility/MathEx.sol";
import { Utils } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

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
        uint32 programDuration;
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
    event ProgramTerminated(ReserveToken indexed pool, uint32 prevEndTime, uint256 availableRewards);

    /**
     * @dev triggered when a program is enabled/disabled
     */
    event ProgramEnabled(ReserveToken indexed pool, bool status, uint256 availableRewards);

    /**
     * @dev triggered when rewards are distributed
     */
    event RewardsDistributed(
        ReserveToken indexed pool,
        uint256 rewardsAmount,
        uint256 poolTokenAmount,
        uint32 programTimeElapsed,
        uint256 availableRewards
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        IERC20 initNetworkToken,
        IMasterPool initMasterPool
    ) validAddress(address(initNetwork)) validAddress(address(initNetworkToken)) validAddress(address(initMasterPool)) {
        _network = initNetwork;
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
        uint256 programsLength = _programByPool.length();
        ProgramData[] memory list = new ProgramData[](programsLength);
        for (uint256 i = 0; i < programsLength; i = uncheckedInc(i)) {
            list[i] = _programs[_programByPool.at(i)];
        }
        return list;
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function isProgramActive(ReserveToken pool) public view returns (bool) {
        ProgramData memory currentProgram = _programs[ReserveToken.unwrap(pool)];

        if (currentProgram.availableRewards == 0) {
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

        if (totalRewards == 0) {
            revert InvalidParam();
        }

        if (distributionType == DistributionType.FLAT) {
            if (startTime > endTime) {
                revert InvalidParam();
            }
        }

        if (startTime < _time()) {
            revert InvalidParam();
        }

        address poolAddress = ReserveToken.unwrap(pool);

        ProgramData storage currentProgram = _programs[poolAddress];

        // it no program exists for the given pool, initialize it
        if (address(currentProgram.poolToken) == address(0)) {
            if (poolAddress == address(_networkToken)) {
                currentProgram.poolToken = _masterPool.poolToken();
            } else {
                currentProgram.poolToken = _network.collectionByPool(pool).poolToken(pool);
            }
        } else {
            // otherwise process rewards one last time to make sure all rewards have been distributed
            processRewards(pool);
        }

        // checking that the rewards vault hold enough pool token for the amount of total rewards token
        if (
            MathEx.mulDivF(
                currentProgram.poolToken.balanceOf(address(rewardsVault)),
                _network.collectionByPool(pool).poolLiquidity(pool).stakedBalance,
                currentProgram.poolToken.totalSupply()
            ) < totalRewards
        ) {
            revert InsufficientFunds();
        }

        currentProgram.rewardsVault = rewardsVault;
        currentProgram.totalRewards = totalRewards;
        currentProgram.availableRewards = totalRewards;
        currentProgram.distributionType = distributionType;
        currentProgram.startTime = startTime;
        currentProgram.endTime = endTime;
        currentProgram.prevDistributionTimestamp = 0;
        currentProgram.isEnabled = true;

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

        if (currentProgram.distributionType == DistributionType.FLAT) {
            currentProgram.endTime = _time();
        }

        uint256 cachedAvailableRewards = currentProgram.availableRewards;
        currentProgram.availableRewards = 0;

        emit ProgramTerminated(pool, currentProgram.endTime, cachedAvailableRewards);
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function enableProgram(ReserveToken pool, bool status) external onlyAdmin {
        ProgramData storage currentProgram = _programs[ReserveToken.unwrap(pool)];

        currentProgram.isEnabled = status;

        emit ProgramEnabled(pool, status, currentProgram.availableRewards);
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function processRewards(ReserveToken pool) public nonReentrant {
        ProgramData storage currentProgram = _programs[ReserveToken.unwrap(pool)];

        DistributionType distributionType = currentProgram.distributionType;

        // if program is disabled, doesn't process rewards
        if (!currentProgram.isEnabled) {
            return;
        }

        // if the program is inactive, has a flat distribution and its end time is lower than the previous distribution timestamp,
        // process the rewards, in any other case it should return
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
            tokensToDistribute = calculateExponentialDecayRewards(
                timeInfo.timeElapsed,
                timeInfo.prevTimeElapsed,
                currentProgram.totalRewards
            );
        } else if (distributionType == DistributionType.FLAT) {
            tokensToDistribute = calculateFlatRewards(
                // calculating the time elapsed since the last distribution
                timeInfo.timeElapsed - timeInfo.prevTimeElapsed,
                // calculating remaining program time
                timeInfo.programDuration - timeInfo.prevTimeElapsed,
                currentProgram.availableRewards
            );
        }

        uint256 poolTokenToBurn = _calculatePoolTokenToBurn(
            poolInfo.stakedBalance,
            tokensToDistribute,
            poolInfo.poolTokenTotalSupply,
            poolInfo.protocolPoolTokenAmount
        );

        uint256 poolTokensInRewardsVault = currentProgram.poolToken.balanceOf(address(currentProgram.rewardsVault));

        currentProgram.rewardsVault.withdrawFunds(
            ReserveToken.wrap(address(currentProgram.poolToken)),
            payable(address(this)),
            // burn the least number of pool token between its balance in the rewards vault and the number of it supposed to be burnt
            Math.min(poolTokenToBurn, poolTokensInRewardsVault)
        );

        currentProgram.availableRewards -= tokensToDistribute;
        currentProgram.prevDistributionTimestamp = timeInfo.currentTime;

        currentProgram.poolToken.burn(poolTokenToBurn);

        emit RewardsDistributed(
            pool,
            tokensToDistribute,
            poolTokenToBurn,
            timeInfo.timeElapsed,
            currentProgram.availableRewards
        );
    }

    /**
     * @dev returns the flat rewards of a given time period
     */
    function calculateFlatRewards(
        uint32 timeElapsedSinceLastDistribution,
        uint32 remainingProgramDuration,
        uint256 availableRewards
    ) internal pure returns (uint256) {
        return _calculateFlatRewards(timeElapsedSinceLastDistribution, remainingProgramDuration, availableRewards);
    }

    /**
     * @dev returns the exponential decay rewards between two time
     */
    function calculateExponentialDecayRewards(
        uint32 timeElapsed,
        uint32 prevTimeElapsed,
        uint256 totalRewards
    ) internal pure returns (uint256) {
        return
            _calculateExponentialDecayRewardsAfterTimeElapsed(timeElapsed, totalRewards) -
            _calculateExponentialDecayRewardsAfterTimeElapsed(prevTimeElapsed, totalRewards);
    }

    /**
     * @dev fetch a pool's information
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
     * @dev fetch a pool's time information
     */
    function _getTimeInfo(ProgramData memory currentProgram) internal view returns (TimeInfo memory) {
        TimeInfo memory timeInfo;

        timeInfo.currentTime = _time();

        timeInfo.programDuration = currentProgram.endTime - currentProgram.startTime;

        uint256 timeElapsed = timeInfo.currentTime - currentProgram.startTime;

        // set time elapsed to the least time between the actual time elapsed and the total program time
        timeInfo.timeElapsed = uint32(Math.min(timeInfo.programDuration, timeElapsed));

        timeInfo.prevTimeElapsed = uint32(
            MathEx.subMax0(currentProgram.prevDistributionTimestamp, currentProgram.startTime)
        );

        return timeInfo;
    }
}
