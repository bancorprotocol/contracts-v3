// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { Utils } from "../utility/Utils.sol";
import { uncheckedInc } from "../utility/MathEx.sol";
import { BancorNetwork } from "./BancorNetwork.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

interface IBancorConverterV1 {
    function reserveTokens() external view returns (ReserveToken[] memory);

    function removeLiquidity(
        uint256 amount,
        ReserveToken[] memory reserveTokens,
        uint256[] memory reserveMinReturnAmounts
    ) external returns (uint256[] memory);
}

/**
 * @dev this contract supports v1 liquidity migration
 */
contract BancorV1Migration is ReentrancyGuard, Utils {
    using SafeERC20 for IERC20;
    using SafeERC20 for IPoolToken;
    using ReserveTokenLibrary for ReserveToken;

    // the network contract
    BancorNetwork private immutable _network;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(BancorNetwork network) validAddress(address(network)) {
        _network = network;
    }

    /**
     * @dev ETH receive callback
     */
    receive() external payable {}

    /**
     * @dev migrates pool tokens from v1 to v3
     *
     * requirements:
     *
     * - the caller must have approved this contract to transfer the pool tokens on its behalf
     */
    function migratePoolTokens(IPoolToken poolToken, uint256 amount) external nonReentrant {
        poolToken.safeTransferFrom(msg.sender, address(this), amount);

        IBancorConverterV1 converter = IBancorConverterV1(payable(poolToken.owner()));

        ReserveToken[] memory reserveTokens = converter.reserveTokens();

        uint256[] memory minReturnAmounts = new uint256[](2);
        minReturnAmounts[0] = 1;
        minReturnAmounts[1] = 1;

        uint256[] memory reserveAmounts = converter.removeLiquidity(amount, reserveTokens, minReturnAmounts);

        for (uint256 i = 0; i < 2; i = uncheckedInc(i)) {
            if (reserveTokens[i].isNativeToken()) {
                _network.depositFor{ value: reserveAmounts[i] }(msg.sender, reserveTokens[i], reserveAmounts[i]);
            } else {
                reserveTokens[i].toIERC20().safeApprove(address(_network), reserveAmounts[i]);
                _network.depositFor(msg.sender, reserveTokens[i], reserveAmounts[i]);
            }
        }
    }
}
