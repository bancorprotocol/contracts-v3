// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { BancorNetwork } from "./BancorNetwork.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

interface IBancorConverterV2 {
    function reserveTokens() external view returns (ReserveToken[] memory);

    function removeLiquidity(
        uint256 amount,
        ReserveToken[] memory reserveTokens,
        uint256[] memory reserveMinReturnAmounts
    ) external returns (uint256[] memory);
}

contract BancorV1Migration is Upgradeable, ReentrancyGuardUpgradeable {
    using ReserveTokenLibrary for ReserveToken;

    BancorNetwork private immutable _network;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(BancorNetwork network) {
        _network = network;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __BancorV1Migration_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorV1Migration_init() internal initializer {
        __Upgradeable_init();
        __ReentrancyGuard_init();

        __BancorV1Migration_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorV1Migration_init_unchained() internal initializer {
    }

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    function migratePoolTokens(IPoolToken poolToken, uint256 amount) external nonReentrant {
        poolToken.transferFrom(msg.sender, address(this), amount);

        IBancorConverterV2 converter = IBancorConverterV2(payable(poolToken.owner()));

        ReserveToken[] memory reserveTokens = converter.reserveTokens();

        uint256[] memory minReturnAmounts = new uint256[](2);
        for (uint256 i = 0; i < 2; i++) {
            minReturnAmounts[i] = 1;
        }

        uint256[] memory reserveAmounts = converter.removeLiquidity(amount, reserveTokens, minReturnAmounts);

        for (uint256 i = 0; i < 2; i++) {
            reserveTokens[i].ensureApprove(address(_network), reserveAmounts[i]);
            _network.migrateLiquidity(reserveTokens[i], msg.sender, reserveAmounts[i]);
        }
    }
}
