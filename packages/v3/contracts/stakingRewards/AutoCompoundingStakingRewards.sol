// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { uncheckedInc } from "../utility/MathEx.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IAutoCompoundingStakingRewards } from "./interfaces/IAutoCompoundingStakingRewards.sol";

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

import "hardhat/console.sol";

enum DistributionType {
    FLAT,
    EXPONENTIAL_DECAY
}

struct ProgramData {
    address pool;
    IVault rewardsVault;
    uint256 totalRewards;
    uint256 availableRewards;
    DistributionType distributionType;
    uint256 startTime;
    uint256 endTime;
    uint256 prevDistributionTimestamp;
    bool isEnabled;
}

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

    // a set of all pool that have a program
    EnumerableSetUpgradeable.AddressSet private _programByPool;

    /**
     * @dev triggered when a program is created
     */
    event ProgramCreated(
        address indexed pool,
        IVault rewardsVault,
        uint256 totalRewards,
        DistributionType distributionType,
        uint256 startTime,
        uint256 endTime
    );

    /**
     * @dev triggered when a program is terminated
     */
    event ProgramTerminated(address indexed pool, uint256 prevEndTime, uint256 availableRewards);

    /**
     * @dev triggered when a program status is updated
     */
    event ProgramEnabled(address indexed pool, bool status, uint256 availableRewards);

    /**
     * @dev triggered when rewards are distributed
     */
    event RewardsDistributed(
        ReserveToken indexed pool,
        uint256 rewardsAmount,
        uint256 poolTokenAmount,
        uint256 timeElapsed,
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

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @dev returns the program data of a pool
     */
    function program(address pool) external view returns (ProgramData memory) {
        return _programs[pool];
    }

    /**
     * @dev returns a list of all pools' program data
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
     * @dev returns wether a program is active or not
     */
    function isProgramActive(address pool) public view returns (bool) {
        ProgramData storage currentProgram = _programs[pool];

        if (currentProgram.availableRewards <= 0) {
            return false;
        }

        if (_time() < currentProgram.startTime) {
            return false;
        }

        if (currentProgram.distributionType == DistributionType.FLAT) {
            // if the program end time has already been passed
            if (_time() > currentProgram.endTime) {
                return false;
            }
        }
        return true;
    }

    /**
     * @dev create a program for a pool
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     * - pool's program must not be active
     */
    function createProgram(
        ReserveToken pool,
        IVault rewardsVault,
        uint256 totalRewards,
        DistributionType distributionType,
        uint256 startTime,
        uint256 endTime
    ) external validAddress(address(ReserveToken.unwrap(pool))) validAddress(address(rewardsVault)) onlyAdmin {
        if (isProgramActive(ReserveToken.unwrap(pool))) {
            revert ProgramActive();
        }

        if (totalRewards <= 0) {
            revert InvalidParam();
        }

        if (startTime > endTime || startTime < _time()) {
            revert InvalidParam();
        }

        ProgramData storage currentProgram = _programs[ReserveToken.unwrap(pool)];

        // if rewards vault address is different from address(0) then they was a previous program
        if (address(currentProgram.rewardsVault) != address(0)) {
            // process rewards to make sure there's no rewards left for that pool
            processRewards(pool);
        }

        currentProgram.pool = ReserveToken.unwrap(pool);
        currentProgram.rewardsVault = rewardsVault;
        currentProgram.totalRewards = totalRewards;
        currentProgram.availableRewards = totalRewards;
        currentProgram.distributionType = distributionType;
        currentProgram.startTime = startTime;
        currentProgram.endTime = endTime;
        currentProgram.prevDistributionTimestamp = 0;
        currentProgram.isEnabled = true;

        emit ProgramCreated(
            ReserveToken.unwrap(pool),
            rewardsVault,
            totalRewards,
            distributionType,
            startTime,
            endTime
        );
    }

    /**
     * @dev terminate a pool's program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function terminateProgram(address pool) external onlyAdmin {
        if (!isProgramActive(pool)) {
            revert ProgramNotActive();
        }

        ProgramData storage currentProgram = _programs[pool];

        if (currentProgram.distributionType == DistributionType.FLAT) {
            currentProgram.endTime = _time();
        }

        uint256 cachedAvailableRewards = currentProgram.availableRewards;
        currentProgram.availableRewards = 0;

        emit ProgramTerminated(pool, currentProgram.endTime, cachedAvailableRewards);
    }

    /**
     * @dev enable or disable a pool's program
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function enableProgram(address pool, bool status) external onlyAdmin {
        ProgramData storage currentProgram = _programs[pool];

        currentProgram.isEnabled = status;
    }

    function fetchPoolInfo(ProgramData memory currentProgram) internal view returns (PoolInfo memory poolInfo) {
        ReserveToken reserveToken = ReserveToken.wrap(currentProgram.pool);
        if (_networkToken == reserveToken.toIERC20()) {
            poolInfo.stakedBalance = _networkTokenPool.stakedBalance();
            poolInfo.poolToken = _networkTokenPool.poolToken();
            poolInfo.amountOfPoolTokenOwnedByProtocol = poolInfo.poolToken.balanceOf(address(_network.masterPool()));
        } else {
            poolInfo.stakedBalance = _network.collectionByPool(reserveToken).poolLiquidity(reserveToken).stakedBalance;
            poolInfo.poolToken = _network.collectionByPool(reserveToken).poolData(reserveToken).poolToken;
            poolInfo.amountOfPoolTokenOwnedByProtocol = poolInfo.poolToken.balanceOf(
                address(currentProgram.rewardsVault)
            );
        }
        poolInfo.poolTokenTotalSupply = poolInfo.poolToken.totalSupply();
        return poolInfo;
    }

    function fetchTimeInfo(ProgramData memory currentProgram) internal view returns (TimeInfo memory) {
        uint256 currentTime = _time();

        uint256 totalProgramTime = currentProgram.endTime - currentProgram.startTime;

        uint256 timeElapsed = currentTime - currentProgram.startTime;
        // if time spent is higher than the total program time, set time to total program time
        timeElapsed = timeElapsed > totalProgramTime ? totalProgramTime : timeElapsed;

        uint256 prevTimeElapsed = currentProgram.prevDistributionTimestamp == 0
            ? currentProgram.prevDistributionTimestamp
            : currentProgram.prevDistributionTimestamp - currentProgram.startTime;

        return
            TimeInfo({
                currentTime: currentTime,
                timeElapsed: timeElapsed,
                prevTimeElapsed: prevTimeElapsed,
                totalProgramTime: totalProgramTime
            });
    }

    function processFlatRewards(
        uint256 timeElapsedSinceLastDistribution,
        uint256 remainingProgramTime,
        uint256 availableRewards
    ) internal pure returns (uint256) {
        return (_processFlatRewards(timeElapsedSinceLastDistribution, remainingProgramTime, availableRewards));
    }

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
     * @dev process a pool's rewards
     */
    function processRewards(ReserveToken pool) public nonReentrant {
        ProgramData storage currentProgram = _programs[ReserveToken.unwrap(pool)];

        if (!isProgramActive(ReserveToken.unwrap(pool))) {
            // if the program is inactive but the previous distributionTimeStamp
            // is lower than the program end time it means that the latest batch of rewards
            // hasn't been sent
            if (currentProgram.distributionType == DistributionType.FLAT) {
                if (!(currentProgram.prevDistributionTimestamp < currentProgram.endTime)) {
                    return;
                }
            }
        }

        PoolInfo memory poolInfo = fetchPoolInfo(currentProgram);
        TimeInfo memory timeInfo = fetchTimeInfo(currentProgram);

        uint256 tokenToDistribute;
        if (currentProgram.distributionType == DistributionType.EXPONENTIAL_DECAY) {
            tokenToDistribute = processExponentialDecayRewards(
                timeInfo.timeElapsed,
                timeInfo.prevTimeElapsed,
                currentProgram.totalRewards
            );
        } else if (currentProgram.distributionType == DistributionType.FLAT) {
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
}
