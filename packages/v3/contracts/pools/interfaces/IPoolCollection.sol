// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { Fraction } from "../../utility/Types.sol";

import { IReserveToken } from "../../token/interfaces/IReserveToken.sol";

import { INetworkSettings } from "../../network/interfaces/INetworkSettings.sol";
import { IBancorNetwork } from "../../network/interfaces/IBancorNetwork.sol";
import { INetworkTokenPool } from "../interfaces/INetworkTokenPool.sol";

import { IPoolToken } from "./IPoolToken.sol";

/**
 * @dev Liquidity Pool Collection interface
 */
interface IPoolCollection {
    struct Pool {
        // the version of the struct
        uint16 version;
        // the pool token of a given pool
        IPoolToken poolToken;
        // the trading fee (in units of PPM)
        uint32 tradingFeePPM;
        // whether trading is enabled
        bool tradingEnabled;
        // whether depositing is enabled
        bool depositingEnabled;
        // the base token trading liquidity
        uint128 baseTokenTradingLiquidity;
        // the network token trading liquidity
        uint128 networkTokenTradingLiquidity;
        // the product of the base token and network token trading liquidities (used for fee calculations)
        uint256 tradingLiquidityProduct;
        // the staked balance
        uint256 stakedBalance;
        // the initial rate of one base token in network token units in a given pool
        Fraction initialRate;
        // the deposit limit
        uint256 depositLimit;
    }

    // solhint-disable var-name-mixedcase

    // arbitrage actions upon base token withdrawal
    enum Action {
        noArbitrage,
        burnNetworkTokens,
        mintNetworkTokens
    }

    // base token withdrawal output amounts
    struct WithdrawalAmounts {
        uint256 B; // base token amount to transfer from the vault to the user
        uint256 C; // network token amount to mint directly for the user
        uint256 D; // base token amount to deduct from the trading liquidity
        uint256 E; // base token amount to transfer from the protection wallet to the user
        uint256 F; // network token amount to deduct from the trading liquidity and burn in the vault
        uint256 G; // network token amount to burn or mint in the pool, in order to create an arbitrage incentive
        Action H; // arbitrage action - burn network tokens in the pool or mint network tokens in the pool or neither
    }

    /**
     * @dev returns the type of the pool
     */
    function poolType() external pure returns (uint16);

    /**
     * @dev returns the network settings contract
     */
    function settings() external view returns (INetworkSettings);

    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev returns the custom symbol overrides for a given reserve token
     */
    function tokenSymbolOverride(IReserveToken reserveToken) external view returns (string memory);

    /**
     * @dev returns the default trading fee (in units of PPM)
     */
    function defaultTradingFeePPM() external view returns (uint32);

    /**
     * @dev returns whether a pool is valid
     */
    function isPoolValid(IReserveToken reserveToken) external view returns (bool);

    /**
     * @dev returns the pool data for a given reserve token
     */
    function poolData(IReserveToken reserveToken) external view returns (Pool memory);

    /**
     * @dev creates a new pool
     *
     * requirements:
     *
     * - the caller must be the network contract
     * - the pool should have been whitelisted
     * - the pool isn't already defined in the collection
     */
    function createPool(IReserveToken reserveToken) external;

    function withdraw(
        bytes32 contextId,
        address provider,
        IReserveToken baseToken,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 protectionWalletBalance
    ) external returns (WithdrawalAmounts memory);
}
