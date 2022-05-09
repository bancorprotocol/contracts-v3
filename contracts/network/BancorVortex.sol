// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";

import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { IBancorVortex } from "./interfaces/IBancorVortex.sol";

/**
 * @dev Bancor Vortex contract
 */
contract BancorVortex is IBancorVortex, Upgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, Utils {
    struct VortexRewards {
        // the percentage of converted BNT to be sent to the initiator of the burning event (in units of PPM)
        uint32 burnRewardPPM;
        // the maximum burn reward to be sent to the initiator of the burning event
        uint256 burnRewardMaxAmount;
    }

    // the address of the Bancor Network contract
    IBancorNetwork private immutable _bancorNetwork;

    // the address of the BNT contract
    IERC20 private immutable _bnt;

    // vortex-rewards configuration
    VortexRewards private _vortexRewards;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 2] private __gap;

    /**
     * @dev triggered when the settings of the Vortex are updated
     */
    event VortexBurnRewardUpdated(
        uint32 prevBurnRewardPPM,
        uint32 newBurnRewardPPM,
        uint256 prevBurnRewardMaxAmount,
        uint256 newBurnRewardMaxAmount
    );

    /**
     * @dev triggered when BNT is traded and vBNT is burned
     */
    event Burned(uint256 bntAmount, uint256 vbntTokenAmount, uint256 reward);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(IBancorNetwork initBancorNetwork, IERC20 initBNT)
        validAddress(address(initBancorNetwork))
        validAddress(address(initBNT))
    {
        _bancorNetwork = initBancorNetwork;
        _bnt = initBNT;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __BancorVortex_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorVortex_init() internal onlyInitializing {
        __Upgradeable_init();
        __ReentrancyGuard_init();
        __Pausable_init();

        __BancorVortex_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorVortex_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 1;
    }

    /**
     * @dev sets the settings of the Vortex
     *
     * requirements:
     *s
     * - the caller must be the admin of the contract
     */
    function setVortexRewards(VortexRewards calldata rewards)
        external
        onlyAdmin
        validFee(rewards.burnRewardPPM)
        greaterThanZero(rewards.burnRewardMaxAmount)
    {
        uint32 prevVortexBurnRewardPPM = _vortexRewards.burnRewardPPM;
        uint256 prevVortexBurnRewardMaxAmount = _vortexRewards.burnRewardMaxAmount;

        if (
            prevVortexBurnRewardPPM == rewards.burnRewardPPM &&
            prevVortexBurnRewardMaxAmount == rewards.burnRewardMaxAmount
        ) {
            return;
        }

        _vortexRewards = rewards;

        emit VortexBurnRewardUpdated({
            prevBurnRewardPPM: prevVortexBurnRewardPPM,
            newBurnRewardPPM: rewards.burnRewardPPM,
            prevBurnRewardMaxAmount: prevVortexBurnRewardMaxAmount,
            newBurnRewardMaxAmount: rewards.burnRewardMaxAmount
        });
    }

    /**
     * @dev returns the settings of the Vortex
     */
    function vortexRewards() external view returns (VortexRewards memory) {
        return _vortexRewards;
    }

    function execute() external nonReentrant whenNotPaused returns (uint256 bntAmountTraded, uint256 vbntAmountBurned) {
        uint256 currentPendingNetworkFeeAmount = _bancorNetwork.withdrawNetworkFees(address(this));

        // temporary, in order to mask out compilation warnings
        bntAmountTraded += currentPendingNetworkFeeAmount;
        vbntAmountBurned += currentPendingNetworkFeeAmount;

        // TODO:
        // note the BNT balance (vortex burn amount)
        // calculate the reward amount using the vortex burn amount as input, along with the reward settings
        // reduce the vortex burn amount by the reward amount
        // perform a trade from BNT to vBNT using the vortex burn amount as input (requires approval)
        // burn the resulting vBNT
        // transfer the remaining BNT balance to the caller
        // emit the Burned event
    }
}
