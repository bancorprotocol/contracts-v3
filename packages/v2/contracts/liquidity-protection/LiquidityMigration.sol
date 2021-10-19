// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.6.12;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../converter/interfaces/IConverterAnchor.sol";
import "../token/interfaces/IDSToken.sol";
import "../token/ReserveToken.sol";

interface IBancorConverterV2 {
    function reserveTokens() external view returns (IReserveToken[] memory);

    function removeLiquidity(
        uint256 amount,
        IReserveToken[] memory reserveTokens,
        uint256[] memory reserveMinReturnAmounts
    ) external returns (uint256[] memory);
}

interface IBancorNetworkV3 {
    function migrateLiquidity(IReserveToken reserveToken, address provider, uint256 amount) external payable;
}

contract LiquidityMigration is ReentrancyGuard {
    using ReserveToken for IReserveToken;

    IBancorNetworkV3 private immutable _network;

    constructor(IBancorNetworkV3 network) public {
        _network = network;
    }

    function migratePoolTokens(IConverterAnchor poolAnchor, uint256 amount) external nonReentrant {
        IDSToken poolToken = IDSToken(address(poolAnchor));

        poolToken.transferFrom(msg.sender, address(this), amount);

        IBancorConverterV2 converter = IBancorConverterV2(payable(poolAnchor.owner()));

        IReserveToken[] memory reserveTokens = converter.reserveTokens();

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
