// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { uncheckedInc } from "../utility/MathEx.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IAutoCompoundingStakingRewards, ProgramData, DistributionType } from "./interfaces/IAutoCompoundingStakingRewards.sol";

import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";
import { Utils } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";

import { StakingRewardsMath } from "./StakingRewardsMath.sol";
import { MathEx } from "../utility/MathEx.sol";
import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";
import { IVault } from "../vaults/interfaces/IVault.sol";

struct TimeInfo {
    uint256 timeElapsed;
    uint256 prevTimeElapsed;
    uint256 totalProgramTime;
    uint256 currentTime;
}

struct PoolInfo {
    uint256 stakedBalance;
    uint256 amountOfPoolTokenOwnedByProtocol;
    uint256 poolTokenTotalSupply;
    IPoolToken poolToken;
}

error ProgramActive();
error ProgramNotActive();
error InvalidParam();

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

    // the network contract
    IBancorNetwork private immutable _network;

    // the network token contract
    IERC20 private immutable _networkToken;

    // the network token pool contract
    IMasterPool private immutable _networkTokenPool;

    // a mapping between a pool address and a program
    mapping(address => ProgramData) private _programs;

    // a set of all pool that have a program associated
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
        DistributionType distributionType,
        uint256 startTime,
        uint256 endTime
    );

    /**
     * @dev triggered when a program is terminated
     */
    event ProgramTerminated(ReserveToken indexed pool, uint256 prevEndTime, uint256 availableRewards);

    /**
     * @dev triggered when a program status is updated
     */
    event ProgramEnabled(ReserveToken indexed pool, bool status, uint256 availableRewards);

    /**
     * @dev triggered when rewards are distributed
     */
    event RewardsDistributed(
        ReserveToken indexed pool,
        uint256 rewardsAmount,
        uint256 poolTokenAmount,
        uint256 programTimeElapsed,
        uint256 availableRewards
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IBancorNetwork initNetwork, IMasterPool initNetworkTokenPool)
        validAddress(address(initNetwork))
        validAddress(address(initNetworkTokenPool))
    {
        _network = initNetwork;
        _networkToken = initNetwork.networkToken();
        _networkTokenPool = initNetworkTokenPool;
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
        __Upgradeable_init();
        __ReentrancyGuard_init();

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
        uint256 totalProgram = _programByPool.length();
        ProgramData[] memory list = new ProgramData[](totalProgram);
        for (uint256 i = 0; i < totalProgram; i = uncheckedInc(i)) {
            list[i] = _programs[_programByPool.at(i)];
        }
        return list;
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function isProgramActive(ReserveToken pool) public view returns (bool) {
        ProgramData storage currentProgram = _programs[ReserveToken.unwrap(pool)];

        if (currentProgram.availableRewards == 0) {
            return false;
        }

        uint256 currentTime = _time();

        if (currentTime < currentProgram.startTime) {
            return false;
        }

        if (currentProgram.distributionType == DistributionType.FLAT) {
            // if the program end time has already been passed
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
        uint256 startTime,
        uint256 endTime
    ) external validAddress(address(ReserveToken.unwrap(pool))) validAddress(address(rewardsVault)) onlyAdmin {
        if (isProgramActive(pool)) {
            revert ProgramActive();
        }

        if (totalRewards == 0) {
            revert InvalidParam();
        }

        if (startTime > endTime || startTime < _time()) {
            revert InvalidParam();
        }

        address poolAsAddress = ReserveToken.unwrap(pool);

        ProgramData storage currentProgram = _programs[poolAsAddress];

        // if no existing program existed for that pool, do additional set up
        if (ReserveToken.unwrap(currentProgram.pool) == address(0)) {
            currentProgram.pool = pool;
        } else {
            // otherwise process rewards one last time to make sure all rewards have been distributed
            processRewards(pool);
        }

        currentProgram.rewardsVault = rewardsVault;
        currentProgram.totalRewards = totalRewards;
        currentProgram.availableRewards = totalRewards;
        currentProgram.distributionType = distributionType;
        currentProgram.startTime = startTime;
        currentProgram.endTime = endTime;
        currentProgram.prevDistributionTimestamp = 0;
        currentProgram.isEnabled = true;

        _programByPool.add(poolAsAddress);
        emit ProgramCreated(pool, rewardsVault, totalRewards, distributionType, startTime, endTime);
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function terminateProgram(ReserveToken pool) external onlyAdmin {
        if (!isProgramActive(pool)) {
            revert ProgramNotActive();
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
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function processRewards(ReserveToken pool) public nonReentrant {
        ProgramData storage currentProgram = _programs[ReserveToken.unwrap(pool)];

        DistributionType distributionType = currentProgram.distributionType;

        if (!isProgramActive(pool)) {
            // if the program is inactive and is a flat distribution
            if (distributionType == DistributionType.FLAT) {
                // if the previous distributionTimeStamp is higher than or equal to the program end time
                // it means that the latest batch of rewards has been distributed, otherwise process the last distribution
                if (currentProgram.prevDistributionTimestamp >= currentProgram.endTime) {
                    return;
                }
            }
        }

        PoolInfo memory poolInfo = fetchPoolInfo(currentProgram);
        TimeInfo memory timeInfo = fetchTimeInfo(currentProgram);

        uint256 tokenToDistribute;
        if (distributionType == DistributionType.EXPONENTIAL_DECAY) {
            tokenToDistribute = processExponentialDecayRewards(
                timeInfo.timeElapsed,
                timeInfo.prevTimeElapsed,
                currentProgram.totalRewards
            );
        } else if (distributionType == DistributionType.FLAT) {
            tokenToDistribute = processFlatRewards(
                timeInfo.timeElapsed - timeInfo.prevTimeElapsed,
                timeInfo.totalProgramTime - timeInfo.prevTimeElapsed,
                currentProgram.availableRewards
            );
        }

        uint256 poolTokenToBurn = _processPoolTokenToBurn(
            poolInfo.stakedBalance,
            tokenToDistribute,
            poolInfo.poolTokenTotalSupply,
            poolInfo.amountOfPoolTokenOwnedByProtocol
        );

        currentProgram.rewardsVault.withdrawFunds(
            ReserveToken.wrap(address(poolInfo.poolToken)),
            payable(address(this)),
            poolTokenToBurn
        );

        currentProgram.availableRewards -= tokenToDistribute;
        currentProgram.prevDistributionTimestamp = timeInfo.currentTime;

        poolInfo.poolToken.approve(address(this), poolTokenToBurn);
        poolInfo.poolToken.burnFrom(address(this), poolTokenToBurn);

        emit RewardsDistributed(
            pool,
            tokenToDistribute,
            poolTokenToBurn,
            timeInfo.timeElapsed,
            currentProgram.availableRewards
        );
    }

    /**
     * @dev process a pool's flat rewards program
     */
    function processFlatRewards(
        uint256 timeElapsedSinceLastDistribution,
        uint256 remainingProgramTime,
        uint256 availableRewards
    ) internal pure returns (uint256) {
        return (_processFlatRewards(timeElapsedSinceLastDistribution, remainingProgramTime, availableRewards));
    }

    /**
     * @dev process a pool's exponential decay rewards program
     */
    function processExponentialDecayRewards(
        uint256 timeElapsed,
        uint256 prevTimeElapsed,
        uint256 totalRewards
    ) internal pure returns (uint256) {
        return
            _processExponentialDecayRewards(timeElapsed, totalRewards) -
            _processExponentialDecayRewards(prevTimeElapsed, totalRewards);
    }

    /**
     * @dev fetch a pool's information
     */
    function fetchPoolInfo(ProgramData memory currentProgram) internal view returns (PoolInfo memory poolInfo) {
        if (currentProgram.pool.toIERC20() == _networkToken) {
            poolInfo.stakedBalance = _networkTokenPool.stakedBalance();
            poolInfo.poolToken = _networkTokenPool.poolToken();
            poolInfo.amountOfPoolTokenOwnedByProtocol = poolInfo.poolToken.balanceOf(address(_network.masterPool()));
        } else {
            poolInfo.stakedBalance = _network
                .collectionByPool(currentProgram.pool)
                .poolLiquidity(currentProgram.pool)
                .stakedBalance;
            poolInfo.poolToken = _network.collectionByPool(currentProgram.pool).poolData(currentProgram.pool).poolToken;
            poolInfo.amountOfPoolTokenOwnedByProtocol = poolInfo.poolToken.balanceOf(
                address(currentProgram.rewardsVault)
            );
        }
        poolInfo.poolTokenTotalSupply = poolInfo.poolToken.totalSupply();
    }

    /**
     * @dev fetch a pool's time information
     */
    function fetchTimeInfo(ProgramData memory currentProgram) internal view returns (TimeInfo memory timeInfo) {
        timeInfo.currentTime = _time();

        timeInfo.totalProgramTime = currentProgram.endTime - currentProgram.startTime;

        uint256 timeElapsed = timeInfo.currentTime - currentProgram.startTime;

        // if time spent is higher than the total program time, set time to total program time
        timeInfo.timeElapsed = timeElapsed > timeInfo.totalProgramTime ? timeInfo.totalProgramTime : timeElapsed;

        timeInfo.prevTimeElapsed = currentProgram.prevDistributionTimestamp == 0
            ? currentProgram.prevDistributionTimestamp
            : currentProgram.prevDistributionTimestamp - currentProgram.startTime;
    }
}
