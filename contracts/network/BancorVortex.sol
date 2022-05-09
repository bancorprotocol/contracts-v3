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
    // the address of the Bancor Network contract
    IBancorNetwork private immutable _bancorNetwork;

    // the address of the BNT contract
    IERC20 private immutable _bnt;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

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
    function initialize() external {
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

    function execute() public nonReentrant whenNotPaused returns (uint256 bntAmountTraded, uint256 vbntAmountBurned) {
        // get the vortex burn reward settings from the network settings contract
        // call withdrawNetworkFees on the network
        // note the BNT balance (vortex burn amount)
        // calculate the reward amount using the vortex burn amount as input, along with the reward settings
        // reduce the vortex burn amount by the reward amount
        // perform a trade from BNT to vBNT using the vortex burn amount as input (requires approval)
        // burn the resulting vBNT
        // transfer the remaining BNT balance to the caller
        // emit the Burned event
    }
}
