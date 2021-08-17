// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";
import { ITokenHolder } from "../../utility/interfaces/ITokenHolder.sol";

import { IReserveToken } from "../../token/interfaces/IReserveToken.sol";

/**
 * @dev Network Settings interface
 */
interface INetworkSettings is IUpgradeable {
    /**
     * @dev returns the protected tokens whitelist
     */
    function protectedTokenWhitelist() external view returns (IReserveToken[] memory);

    /**
     * @dev checks whether a given token is whitelisted
     */
    function isTokenWhitelisted(IReserveToken pool) external view returns (bool);

    /**
     * @dev returns the network token minting limit for a given token
     */
    function poolMintingLimit(IReserveToken pool) external view returns (uint256);

    /**
     * @dev returns the minimum network token liquidity for trading
     */
    function minLiquidityForTrading() external view returns (uint256);

    /**
     * @dev returns the network fee parameters (in units of PPM)
     */
    function networkFeeParams() external view returns (ITokenHolder, uint32);

    /**
     * @dev returns the wallet that receives the global network fees
     */
    function networkFeeWallet() external view returns (ITokenHolder);

    /**
     * @dev returns the global network fee (in units of PPM)
     *
     * notes:
     *
     * - the network fee is a portion of the total fees from each pool
     */
    function networkFeePPM() external view returns (uint32);

    /**
     * @dev returns the withdrawal fee (in units of PPM)
     */
    function withdrawalFeePPM() external view returns (uint32);

    /**
     * @dev returns the flash-loan fee (in units of PPM)
     */
    function flashLoanFeePPM() external view returns (uint32);

    /**
     * @dev returns the maximum deviation of the average rate from the spot rate (in units of PPM)
     */
    function averageRateMaxDeviationPPM() external view returns (uint32);
}
