// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";

import { Utils } from "../utility/Utils.sol";
import { uncheckedInc } from "../utility/MathEx.sol";
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

contract BancorV1Migration is ReentrancyGuard, Utils {
    using ReserveTokenLibrary for ReserveToken;

    BancorNetwork private immutable _network;

    constructor(BancorNetwork network) validAddress(address(network)) {
        _network = network;
    }

    function migratePoolTokens(IPoolToken poolToken, uint256 amount) external nonReentrant {
        poolToken.transferFrom(msg.sender, address(this), amount);

        IBancorConverterV2 converter = IBancorConverterV2(payable(poolToken.owner()));

        ReserveToken[] memory reserveTokens = converter.reserveTokens();

        uint256[] memory minReturnAmounts = new uint256[](2);
        for (uint256 i = 0; i < 2; i = uncheckedInc(i)) {
            minReturnAmounts[i] = 1;
        }

        uint256[] memory reserveAmounts = converter.removeLiquidity(amount, reserveTokens, minReturnAmounts);

        for (uint256 i = 0; i < 2; i = uncheckedInc(i)) {
            reserveTokens[i].ensureApprove(address(_network), reserveAmounts[i]);
            _network.migrateLiquidity(reserveTokens[i], msg.sender, reserveAmounts[i]);
        }
    }
}
