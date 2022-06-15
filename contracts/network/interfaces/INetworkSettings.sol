// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { Token } from "../../token/Token.sol";

error NotWhitelisted();

struct VortexRewards {
    // the percentage of converted BNT to be sent to the initiator of the burning event (in units of PPM)
    uint32 burnRewardPPM;
    // the maximum burn reward to be sent to the initiator of the burning event
    uint256 burnRewardMaxAmount;
}

/**
 * @dev Network Settings interface
 */
interface INetworkSettings is IUpgradeable {
    /**
     * @dev returns the protected tokens whitelist
     */
    function protectedTokenWhitelist() external view returns (Token[] memory);

    /**
     * @dev checks whether a given token is whitelisted
     */
    function isTokenWhitelisted(Token pool) external view returns (bool);

    /**
     * @dev returns the BNT funding limit for a given pool
     */
    function poolFundingLimit(Token pool) external view returns (uint256);

    /**
     * @dev returns the minimum BNT trading liquidity required before the system enables trading in the relevant pool
     */
    function minLiquidityForTrading() external view returns (uint256);

    /**
     * @dev returns the withdrawal fee (in units of PPM)
     */
    function withdrawalFeePPM() external view returns (uint32);

    /**
     * @dev returns the default flash-loan fee (in units of PPM)
     */
    function defaultFlashLoanFeePPM() external view returns (uint32);

    /**
     * @dev returns the flash-loan fee (in units of PPM) of a pool
     */
    function flashLoanFeePPM(Token pool) external view returns (uint32);

    /**
     * @dev returns the vortex settings
     */
    function vortexRewards() external view returns (VortexRewards memory);
}
