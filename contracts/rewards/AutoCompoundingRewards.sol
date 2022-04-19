// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AccessDenied, DoesNotExist, AlreadyExists, InvalidParam } from "../utility/Utils.sol";
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
    EXPONENTIAL_DECAY_DISTRIBUTION
} from "./interfaces/IAutoCompoundingRewards.sol";

import { RewardsMath } from "./RewardsMath.sol";

/**
 * @dev Auto-compounding Rewards contract
 */
contract AutoCompoundingRewards is IAutoCompoundingRewards, ReentrancyGuardUpgradeable, Utils, Time, Upgradeable {
    using TokenLibrary for Token;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    error InsufficientFunds();

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

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 3] private __gap;

    /**
     * @dev triggered when a program is created
     */
    event ProgramCreated(
        Token indexed pool,
        uint8 indexed distributionType,
        uint256 totalRewards,
        uint32 startTime,
        uint32 endTime,
        uint32 halfLifeInDays
    );

    /**
     * @dev triggered when a program is terminated prematurely
     */
    event ProgramTerminated(Token indexed pool, uint32 endTime, uint256 remainingRewards);

    /**
     * @dev triggered when a program is enabled/disabled
     */
    event ProgramEnabled(Token indexed pool, bool status, uint256 remainingRewards);

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
    function __AutoCompoundingRewards_init_unchained() internal onlyInitializing {}

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
    function isProgramActive(Token pool) external view returns (bool) {
        ProgramData memory p = _programs[pool];

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
     * @inheritdoc IAutoCompoundingRewards
     */
    function createProgram(
        Token pool,
        uint256 totalRewards,
        uint8 distributionType,
        uint32 startTime,
        uint32 endTime,
        uint32 halfLifeInDays
    ) external validAddress(address(pool)) greaterThanZero(totalRewards) onlyAdmin nonReentrant {
        if (_doesProgramExist(_programs[pool])) {
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

        uint32 currTime = _time();
        if (distributionType == FLAT_DISTRIBUTION) {
            if (!(currTime <= startTime && startTime < endTime && halfLifeInDays == 0)) {
                revert InvalidParam();
            }
        } else if (distributionType == EXPONENTIAL_DECAY_DISTRIBUTION) {
            if (!(currTime <= startTime && endTime == 0 && halfLifeInDays != 0)) {
                revert InvalidParam();
            }
        } else {
            revert InvalidParam();
        }

        ProgramData memory p = ProgramData({
            startTime: startTime,
            endTime: endTime,
            halfLife: halfLifeInDays * 1 days,
            prevDistributionTimestamp: 0,
            poolToken: poolToken,
            isEnabled: true,
            distributionType: distributionType,
            totalRewards: totalRewards,
            remainingRewards: totalRewards
        });

        _verifyFunds(_poolTokenAmountToBurn(pool, p, totalRewards), poolToken, _rewardsVault(pool));

        _programs[pool] = p;

        assert(_pools.add(address(pool)));

        emit ProgramCreated({
            pool: pool,
            distributionType: distributionType,
            totalRewards: totalRewards,
            startTime: startTime,
            endTime: endTime,
            halfLifeInDays: halfLifeInDays
        });
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function terminateProgram(Token pool) external onlyAdmin {
        ProgramData memory p = _programs[pool];

        if (!_doesProgramExist(p)) {
            revert DoesNotExist();
        }

        delete _programs[pool];

        assert(_pools.remove(address(pool)));

        emit ProgramTerminated({ pool: pool, endTime: p.endTime, remainingRewards: p.remainingRewards });
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function enableProgram(Token pool, bool status) external onlyAdmin {
        ProgramData memory p = _programs[pool];

        if (!_doesProgramExist(p)) {
            revert DoesNotExist();
        }

        bool prevStatus = p.isEnabled;
        if (prevStatus == status) {
            return;
        }

        _programs[pool].isEnabled = status;

        emit ProgramEnabled({ pool: pool, status: status, remainingRewards: p.remainingRewards });
    }

    /**
     * @inheritdoc IAutoCompoundingRewards
     */
    function processRewards(Token pool) external nonReentrant {
        ProgramData memory p = _programs[pool];

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
            // if (p.distributionType == EXPONENTIAL_DECAY_DISTRIBUTION)
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
    function _doesProgramExist(ProgramData memory p) private pure returns (bool) {
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
