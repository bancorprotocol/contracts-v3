// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";
import { Time } from "../utility/Time.sol";

import { IAutoCompoundingRewards } from "../rewards/interfaces/IAutoCompoundingRewards.sol";
import { IBancorVortex } from "./interfaces/IBancorVortex.sol";
import { IBancorHarvester } from "./interfaces/IBancorHarvester.sol";

/**
 * @dev Bancor Harvester contract
 */
contract BancorHarvester is IBancorHarvester, Upgradeable, ReentrancyGuardUpgradeable, Utils, Time {
    using SafeERC20 for IERC20;

    struct HarvesterThresholds {
        // the minimum time duration required for processing the rewards
        uint32 processRewardsDuration;
        // the minimum rewards amount required for executing the vortex
        uint256 vortexRewardsAmount;
    }

    // the address of the Auto Compounding Rewards contract
    IAutoCompoundingRewards private immutable _autoCompoundingRewards;

    // the address of the Bancor Vortex contract
    IBancorVortex private immutable _bancorVortex;

    // the address of the BNT contract
    IERC20 private immutable _bnt;

    // harvester-thresholds configuration
    HarvesterThresholds private _harvesterThresholds;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 2] private __gap;

    /**
     * @dev triggered when the configuration of the Harvester is updated
     */
    event HarvesterThresholdsUpdated(
        uint32 prevProcessRewardsDuration,
        uint32 newProcessRewardsDuration,
        uint256 prevVortexRewardsAmount,
        uint256 newVortexRewardsAmount
    );

    /**
     * @dev triggered when harvesting is executed
     */
    event HarvestTriggered(address indexed caller, uint256 rewards);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IAutoCompoundingRewards initAutoCompoundingRewards,
        IBancorVortex initBancorVortex,
        IERC20 initBNT
    )
        validAddress(address(initAutoCompoundingRewards))
        validAddress(address(initBancorVortex))
        validAddress(address(initBNT))
    {
        _autoCompoundingRewards = initAutoCompoundingRewards;
        _bancorVortex = initBancorVortex;
        _bnt = initBNT;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __BancorHarvester_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorHarvester_init() internal onlyInitializing {
        __Upgradeable_init();
        __ReentrancyGuard_init();

        __BancorHarvester_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorHarvester_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 1;
    }

    /**
     * @dev returns the configuration of the Harvester
     */
    function harvesterThresholds() external view returns (HarvesterThresholds memory) {
        return _harvesterThresholds;
    }

    /**
     * @dev updates the configuration of the Harvester
     *
     * requirements:
     *s
     * - the caller must be the admin of the contract
     */
    function setHarvesterThresholds(HarvesterThresholds calldata thresholds)
        external
        onlyAdmin
        greaterThanZero(thresholds.processRewardsDuration)
        greaterThanZero(thresholds.vortexRewardsAmount)
    {
        uint32 prevProcessRewardsDuration = _harvesterThresholds.processRewardsDuration;
        uint256 prevVortexRewardsAmount = _harvesterThresholds.vortexRewardsAmount;

        if (
            prevProcessRewardsDuration == thresholds.processRewardsDuration &&
            prevVortexRewardsAmount == thresholds.vortexRewardsAmount
        ) {
            return;
        }

        _harvesterThresholds = thresholds;

        emit HarvesterThresholdsUpdated({
            prevProcessRewardsDuration: prevProcessRewardsDuration,
            newProcessRewardsDuration: thresholds.processRewardsDuration,
            prevVortexRewardsAmount: prevVortexRewardsAmount,
            newVortexRewardsAmount: thresholds.vortexRewardsAmount
        });
    }

    /**
     * @dev executes harvesting
     */
    function execute() external nonReentrant {
        uint256 prevBalance = _bnt.balanceOf(address(this));

        //_autoCompoundingRewards.autoProcessRewards();

        _bancorVortex.execute();

        uint256 currBalance = _bnt.balanceOf(address(this));

        _bnt.safeTransfer(msg.sender, currBalance - prevBalance);

        emit HarvestTriggered(msg.sender, currBalance - prevBalance);
    }
}
