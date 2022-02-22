// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { EnumerableSetUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, AccessDenied } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

import { INetworkSettings, NotWhitelisted } from "../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IVault, ROLE_ASSET_MANAGER } from "../vaults/interfaces/IVault.sol";

import { IStandardStakingRewards } from "./interfaces/IStandardStakingRewards.sol";

/**
 * @dev Standard Staking Rewards contract
 */
contract StandardStakingRewards is IStandardStakingRewards, ReentrancyGuardUpgradeable, Utils, Time, Upgradeable {
    using TokenLibrary for Token;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.AddressSet;

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the BNT contract
    IERC20 private immutable _bnt;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initBNT
    ) validAddress(address(initNetwork)) validAddress(address(initNetworkSettings)) validAddress(address(initBNT)) {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _bnt = initBNT;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __StandardStakingRewards_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __StandardStakingRewards_init() internal initializer {
        __ReentrancyGuard_init();
        __Upgradeable_init();

        __StandardStakingRewards_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __StandardStakingRewards_init_unchained() internal initializer {}

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc IVersioned
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    // /**
    //  * @inheritdoc IStandardStakingRewards
    //  */
    function createProgram(
        Token pool,
        IVault rewardsVault,
        Token rewardsToken,
        uint32 endTime,
        uint256 rewardRate
    )
        external
        validAddress(address(address(pool)))
        validAddress(address(rewardsVault))
        validAddress(address(rewardsToken))
        onlyAdmin
        nonReentrant
    {
        if (!rewardsVault.hasRole(ROLE_ASSET_MANAGER, address(this))) {
            revert AccessDenied();
        }
    }

    //     struct ProgramData {
    // uint32 startTime;
    // uint32 endTime;
    // uint32 prevDistributionTimestamp;
    // IPoolToken poolToken;
    // bool isEnabled;
    // IVault rewardsVault;
    // Token rewardsToken;
    // uint256 rewardsRate;
    // remainingRewards ?
}
