// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";
import { Token } from "../token/Token.sol";

import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { IBancorVortex } from "./interfaces/IBancorVortex.sol";
import { Time } from "../utility/Time.sol";
import { MathEx } from "../utility/MathEx.sol";

/**
 * @dev Bancor Vortex contract
 */
contract BancorVortex is IBancorVortex, Upgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, Utils, Time {
    using SafeERC20 for IERC20;

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

    // the address of the VBNT contract
    IERC20 private immutable _vbnt;

    // the address of the VBNT Governance contract
    ITokenGovernance private immutable _vbntGovernance;

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
     * @dev triggered when vBNT is burned
     */
    event Burned(uint256 bntAmount, uint256 vbntAmount, uint256 rewards);

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initBancorNetwork,
        IERC20 initBNT,
        ITokenGovernance initVBNTGovernance
    )
        validAddress(address(initBancorNetwork))
        validAddress(address(initBNT))
        validAddress(address(initVBNTGovernance))
    {
        _bancorNetwork = initBancorNetwork;
        _bnt = initBNT;
        _vbntGovernance = initVBNTGovernance;
        _vbnt = initVBNTGovernance.token();
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
     * @dev returns the settings of the Vortex
     */
    function vortexRewards() external view returns (VortexRewards memory) {
        return _vortexRewards;
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

    function execute() external nonReentrant whenNotPaused returns (uint256, uint256) {
        uint256 currentPendingNetworkFeeAmount = _bancorNetwork.withdrawNetworkFees(address(this));

        uint256 bntTotalAmount = _bnt.balanceOf(address(this));

        uint256 bntRewardsAmount = Math.min(
            MathEx.mulDivF(bntTotalAmount, _vortexRewards.burnRewardPPM, PPM_RESOLUTION),
            _vortexRewards.burnRewardMaxAmount
        );

        _bnt.safeApprove(address(_bancorNetwork), bntRewardsAmount);

        uint256 vbntRewardsAmount = _bancorNetwork.tradeBySourceAmount(
            Token(address(_bnt)),
            Token(address(_vbnt)),
            bntRewardsAmount,
            1,
            _time(),
            address(this)
        );

        uint256 rewards = bntTotalAmount - bntRewardsAmount;

        _vbntGovernance.burn(vbntRewardsAmount);

        _bnt.safeTransfer(msg.sender, rewards);

        emit Burned(bntRewardsAmount, vbntRewardsAmount, rewards);

        return (bntRewardsAmount, vbntRewardsAmount);
    }
}
