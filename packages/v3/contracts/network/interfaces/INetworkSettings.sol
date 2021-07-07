// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../../utility/interfaces/IUpgradeable.sol";
import "../../utility/interfaces/ITokenHolder.sol";

import "../../token/interfaces/IReserveToken.sol";

/**
 * @dev Network Settings interface
 */
interface INetworkSettings is IUpgradeable {
    function protectedTokensWhitelist() external view returns (IReserveToken[] memory);

    function isTokenWhitelisted(IReserveToken reserveToken) external view returns (bool);

    function poolMintingLimit(IReserveToken reserveToken) external view returns (uint256);

    function networkFeeParams() external view returns (ITokenHolder, uint32);

    function networkFeeWallet() external view returns (ITokenHolder);

    function networkFeePPM() external view returns (uint32);

    function withdrawalFeePPM() external view returns (uint32);

    function flashLoanFeePPM() external view returns (uint32);

    function averageRateMaxDeviationPPM() external view returns (uint32);
}
