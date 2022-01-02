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
    function isProgramActive(ReserveToken pool) external view returns (bool) {
        return _programs[ReserveToken.unwrap(pool)].isActive;
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
        ProgramData memory p = _programs[ReserveToken.unwrap(pool)];

        if (p.isActive) {
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

        if (distributionType == FLAT_DISTRIBUTION) {
            if (startTime > endTime || endTime == 0) {
                revert InvalidParam();
            }
        } else if (distributionType == EXPONENTIAL_DECAY_DISTRIBUTION) {
            if (endTime != 0) {
                revert InvalidParam();
            }
        }

        bool programExists = address(p.poolToken) != address(0);
        IPoolToken poolToken;
        uint256 requiredPoolTokenAmount;

        if (isNetworkToken) {
            poolToken = _masterPoolToken;
            requiredPoolTokenAmount = _masterPool.underlyingToPoolToken(totalRewards);
        } else {
            IPoolCollection poolCollection = _network.collectionByPool(pool);
            poolToken = poolCollection.poolToken(pool);
            requiredPoolTokenAmount = poolCollection.underlyingToPoolToken(pool, totalRewards);
        }

        // check whether the rewards vault holds enough funds to cover the total rewards
        if (requiredPoolTokenAmount > poolToken.balanceOf(address(rewardsVault))) {
            revert InsufficientFunds();
        }

        _programs[ReserveToken.unwrap(pool)] = ProgramData({
            startTime: startTime,
            endTime: endTime,
            prevDistributionTimestamp: 0,
            totalRewards: totalRewards,
            remainingRewards: totalRewards,
            rewardsVault: rewardsVault,
            poolToken: poolToken,
            isActive: true,
            isEnabled: true,
            distributionType: distributionType
        });

        bool programAdded = _programByPool.add(ReserveToken.unwrap(pool));
        assert(programAdded != programExists);

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
        ProgramData storage p = _programs[ReserveToken.unwrap(pool)];

        if (!p.isActive) {
            revert ProgramInactive();
        }

        p.isActive = false;

        emit ProgramTerminated({ pool: pool, endTime: _time(), remainingRewards: p.remainingRewards });
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function enableProgram(ReserveToken pool, bool status) external onlyAdmin {
        ProgramData storage p = _programs[ReserveToken.unwrap(pool)];

        bool prevStatus = p.isEnabled;
        if (prevStatus == status) {
            return;
        }

        p.isEnabled = status;

        emit ProgramEnabled({ pool: pool, status: status, remainingRewards: p.remainingRewards });
    }

    /**
     * @inheritdoc IAutoCompoundingStakingRewards
     */
    function processRewards(ReserveToken pool) external nonReentrant {
        ProgramData memory p = _programs[ReserveToken.unwrap(pool)];

        uint32 currentTime = _time();

        // if the program is not active or not enabled or hasn't started yet, don't process the rewards
        if (!p.isActive || !p.isEnabled || p.startTime > currentTime) {
            return;
        }

        uint32 timeElapsed = currentTime - p.startTime;

        (uint256 tokenAmountToDistribute, uint256 poolTokenAmountToBurn) = _processRewardAmounts(pool, p, timeElapsed);
        if (tokenAmountToDistribute == 0 || poolTokenAmountToBurn == 0) {
            return;
        }

        p.rewardsVault.burn(ReserveToken.wrap(address(p.poolToken)), poolTokenAmountToBurn);

        p.remainingRewards -= tokenAmountToDistribute;
        p.prevDistributionTimestamp = currentTime;
        if (p.distributionType == FLAT_DISTRIBUTION && p.endTime < currentTime) {
            p.isActive = false;
        }

        _programs[ReserveToken.unwrap(pool)] = p;

        emit RewardsDistributed({
            pool: pool,
            rewardsAmount: tokenAmountToDistribute,
            poolTokenAmount: poolTokenAmountToBurn,
            programTimeElapsed: timeElapsed,
            remainingRewards: p.remainingRewards
        });
    }

    /**
     * @dev ???
     */
    function _processRewardAmounts(
        ReserveToken pool,
        ProgramData memory p,
        uint32 timeElapsed
    ) private view returns (uint256 tokenAmountToDistribute, uint256 poolTokenAmountToBurn) {
        uint32 prevTimeElapsed = uint32(MathEx.subMax0(p.prevDistributionTimestamp, p.startTime));

        if (p.distributionType == FLAT_DISTRIBUTION) {
            tokenAmountToDistribute = StakingRewardsMath.calcFlatRewards(
                p.totalRewards,
                timeElapsed - prevTimeElapsed,
                p.endTime - p.startTime
            );
        } else if (p.distributionType == EXPONENTIAL_DECAY_DISTRIBUTION) {
            tokenAmountToDistribute =
                StakingRewardsMath.calcExpDecayRewards(p.totalRewards, timeElapsed) -
                StakingRewardsMath.calcExpDecayRewards(p.totalRewards, prevTimeElapsed);
        }

        if (_isNetworkToken(pool)) {
            poolTokenAmountToBurn = _masterPool.poolTokenAmountToBurn(tokenAmountToDistribute);
        } else {
            IPoolCollection poolCollection = _network.collectionByPool(pool);
            uint256 totalAmount = p.poolToken.balanceOf(address(p.rewardsVault));
            uint256 burnAmount = poolCollection.poolTokenAmountToBurn(pool, tokenAmountToDistribute, totalAmount);
            // do not attempt to burn more than the balance in the rewards vault
            poolTokenAmountToBurn = Math.min(burnAmount, totalAmount);
        }
    }

    /**
     * @dev returns whether the specified token is the network token
     */
    function _isNetworkToken(ReserveToken token) private view returns (bool) {
        return token.toIERC20() == _networkToken;
    }
}
