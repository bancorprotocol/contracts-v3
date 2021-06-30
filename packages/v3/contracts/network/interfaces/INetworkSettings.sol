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

    function addTokenToProtectedTokensWhitelist(IReserveToken token) external;

    function removeTokenFromProtectedTokensWhitelist(IReserveToken token) external;

    function isTokenWhitelisted(IReserveToken token) external view returns (bool);

    function poolMintingLimit(IReserveToken token) external view returns (uint256);

    function setPoolMintingLimit(IReserveToken token, uint256 amount) external;

    function networkFeeParams() external view returns (ITokenHolder, uint32);

    function networkFeeWallet() external view returns (ITokenHolder);

    function networkFeePPM() external view returns (uint32);

    function setNetworkFeeWallet(ITokenHolder newNetworkFeeWallet) external;

    function setNetworkFeePPM(uint32 newNetworkFeePPM) external;

    function exitFeePPM() external view returns (uint32);

    function setExitFeePPM(uint32 newExitFeePPM) external;

    function flashLoanFeePPM() external view returns (uint32);

    function setFlashLoanFeePPM(uint32 newFlashLoanFeePPM) external;

    function averageRateMaxDeviationPPM() external view returns (uint32);

    function setAverageRateMaxDeviationPPM(uint32 newAverageRateMaxDeviationPPM) external;
}
