// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { uncheckedInc } from "../utility/MathEx.sol";
import { Utils, NotWhitelisted } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";
import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";
import { IVault } from "../vaults/interfaces/IVault.sol";

// prettier-ignore
import {
    IAutoCompoundingStakingRewards,
    ProgramData,
    FLAT_DISTRIBUTION,
    EXPONENTIAL_DECAY_DISTRIBUTION
} from "./interfaces/IAutoCompoundingStakingRewards.sol";

import { StakingRewardsMath } from "./StakingRewardsMath.sol";

/**
 * @dev Auto-compounding Staking Rewards contract
 */
contract AutoCompoundingStakingRewards is
    IAutoCompoundingStakingRewards,
    ReentrancyGuardUpgradeable,
    Utils,
    Time,
    Upgradeable
{
    using ReserveTokenLibrary for ReserveToken;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    error ProgramDoesNotExist();
    error ProgramAlreadyExists();
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
        uint8 indexed distributionType,
        IVault rewardsVault,
        uint256 totalRewards,
        uint256 startTime,
        uint256 endTime
    );

    /**
     * @dev triggered when a program is terminated prematurely
     */
    event ProgramTerminated(ReserveToken indexed pool, uint32 endTime, uint256 remainingRewards);

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
    function isProgramActive(ReserveToken pool) external view returns (bool) {
        ProgramData memory p = _programs[ReserveToken.unwrap(pool)];

        if (!_doesProgramExist(p)) {
            return false;
        }

        uint32 currTime = _time();

        if (p.distributionType == EXPONENTIAL_DECAY_DISTRIBUTION) {
            return p.startTime <= currTime;
        }

        return p.startTime <= currTime && currTime <= p.endTime;
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function createProgram(
        ReserveToken pool,
        IVault rewardsVault,
        uint256 totalRewards,
        uint8 distributionType,
        uint32 startTime,
        uint32 endTime
    )
        external
        validAddress(address(ReserveToken.unwrap(pool)))
        validAddress(address(rewardsVault))
        onlyAdmin
        nonReentrant
    {
        if (_doesProgramExist(_programs[ReserveToken.unwrap(pool)])) {
            revert ProgramAlreadyExists();
        }

        IPoolToken poolToken;
        if (_isNetworkToken(pool)) {
            if (rewardsVault != _masterPool) {
                revert InvalidParam();
            }
            poolToken = _masterPoolToken;
        } else {
            if (!_networkSettings.isTokenWhitelisted(pool)) {
                revert NotWhitelisted();
            }
            poolToken = _network.collectionByPool(pool).poolToken(pool);
        }

        if (totalRewards == 0) {
            revert InvalidParam();
        }

        uint32 currTime = _time();
        if (distributionType == FLAT_DISTRIBUTION) {
            if (!(currTime <= startTime && startTime < endTime)) {
                revert InvalidParam();
            }
        } else if (distributionType == EXPONENTIAL_DECAY_DISTRIBUTION) {
            if (!(currTime <= startTime && endTime == 0)) {
                revert InvalidParam();
            }
        } else {
            revert InvalidParam();
        }


        ProgramData memory p = ProgramData({
            startTime: startTime,
            endTime: endTime,
            prevDistributionTimestamp: 0,
            poolToken: poolToken,
            isEnabled: true,
            distributionType: distributionType,
            rewardsVault: rewardsVault,
            totalRewards: totalRewards,
            remainingRewards: totalRewards
        });

        _verifyFunds(_poolTokenAmountToBurn(pool, p, totalRewards), poolToken, rewardsVault);

        _programs[ReserveToken.unwrap(pool)] = p;

        assert(_programByPool.add(ReserveToken.unwrap(pool)));

        emit ProgramCreated({
            pool: pool,
            distributionType: distributionType,
            rewardsVault: rewardsVault,
            totalRewards: totalRewards,
            startTime: startTime,
            endTime: endTime
        });
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function terminateProgram(ReserveToken pool) external onlyAdmin {
        ProgramData memory p = _programs[ReserveToken.unwrap(pool)];

        if (!_doesProgramExist(p)) {
            revert ProgramDoesNotExist();
        }

        delete _programs[ReserveToken.unwrap(pool)];

        emit ProgramTerminated({ pool: pool, endTime: p.endTime, remainingRewards: p.remainingRewards });
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function enableProgram(ReserveToken pool, bool status) external onlyAdmin {
        ProgramData memory p = _programs[ReserveToken.unwrap(pool)];

        if (!_doesProgramExist(p)) {
            revert ProgramDoesNotExist();
        }

        bool prevStatus = p.isEnabled;
        if (prevStatus == status) {
            return;
        }

        _programs[ReserveToken.unwrap(pool)].isEnabled = status;

        emit ProgramEnabled({ pool: pool, status: status, remainingRewards: p.remainingRewards });
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function processRewards(ReserveToken pool) external nonReentrant {
        ProgramData memory p = _programs[ReserveToken.unwrap(pool)];

        uint32 currTime = _time();

        if (!p.isEnabled || currTime < p.startTime) {
            return;
        }

        uint256 tokenAmountToDistribute = _tokenAmountToDistribute(p, currTime);
        if (tokenAmountToDistribute == 0) {
            return;
        }

        uint256 poolTokenAmountToBurn = _poolTokenAmountToBurn(pool, p, tokenAmountToDistribute);
        if (poolTokenAmountToBurn == 0) {
            return;
        }

        _verifyFunds(poolTokenAmountToBurn, p.poolToken, p.rewardsVault);
        p.rewardsVault.burn(ReserveToken.wrap(address(p.poolToken)), poolTokenAmountToBurn);

        p.remainingRewards -= tokenAmountToDistribute;
        p.prevDistributionTimestamp = currTime;

        _programs[ReserveToken.unwrap(pool)] = p;

        emit RewardsDistributed({
            pool: pool,
            rewardsAmount: tokenAmountToDistribute,
            poolTokenAmount: poolTokenAmountToBurn,
            remainingRewards: p.remainingRewards
        });
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
                StakingRewardsMath.calcFlatRewards(
                    p.totalRewards,
                    currTimeElapsed - prevTimeElapsed,
                    p.endTime - p.startTime
                );
        } else {
            // if (p.distributionType == EXPONENTIAL_DECAY_DISTRIBUTION)
            uint32 currTimeElapsed = currTime - p.startTime;
            uint32 prevTimeElapsed = prevTime - p.startTime;
            return
                StakingRewardsMath.calcExpDecayRewards(p.totalRewards, currTimeElapsed) -
                StakingRewardsMath.calcExpDecayRewards(p.totalRewards, prevTimeElapsed);
        }
    }

    /**
     * @dev returns the amount of pool tokens to burn
     */
    function _poolTokenAmountToBurn(
        ReserveToken pool,
        ProgramData memory p,
        uint256 tokenAmountToDistribute
    ) private view returns (uint256) {
        if (_isNetworkToken(pool)) {
            return _masterPool.poolTokenAmountToBurn(tokenAmountToDistribute);
        } else {
            return
                _network.collectionByPool(pool).poolTokenAmountToBurn(
                    pool,
                    tokenAmountToDistribute,
                    p.poolToken.balanceOf(address(p.rewardsVault))
                );
        }
    }

    /**
     * @dev returns whether or not a given program exists
     */
    function _doesProgramExist(ProgramData memory p) private pure returns (bool) {
        return address(p.poolToken) != address(0);
    }

    /**
     * @dev returns whether the specified token is the network token
     */
    function _isNetworkToken(ReserveToken token) private view returns (bool) {
        return token.toIERC20() == _networkToken;
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
