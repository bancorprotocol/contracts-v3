// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IPoolTokenFactory } from "../pools/interfaces/IPoolTokenFactory.sol";
import { PoolCollection, Pool, PoolLiquidity, WithdrawalAmounts } from "../pools/PoolCollection.sol";
import { AverageRate } from "../pools/PoolAverageRate.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

contract TestPoolCollection is PoolCollection {
    constructor(IBancorNetwork initNetwork, IPoolTokenFactory initPoolTokenFactory)
        PoolCollection(initNetwork, initPoolTokenFactory)
    {}

    function poolData(IReserveToken reserveToken) external view returns (Pool memory) {
        return _pools[reserveToken];
    }

    function mintT(
        address recipient,
        IPoolToken poolToken,
        uint256 amount
    ) external {
        poolToken.mint(recipient, amount);
    }

    function setTradingLiquidityT(IReserveToken reserveToken, PoolLiquidity calldata liquidity) external {
        _pools[reserveToken].liquidity = liquidity;
    }

    function setAverageRateT(IReserveToken reserveToken, AverageRate calldata newAverageRate) external {
        _pools[reserveToken].averageRate = newAverageRate;
    }

    function poolWithdrawalAmountsT(
        IReserveToken baseToken,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 externalProtectionWalletBalance
    ) external view returns (WithdrawalAmounts memory) {
        return
            _poolWithdrawalAmounts(
                baseToken,
                basePoolTokenAmount,
                baseTokenVaultBalance,
                externalProtectionWalletBalance
            );
    }

    function withdrawalAmountsT(
        uint256 networkTokenLiquidity,
        uint256 baseTokenLiquidity,
        uint256 baseTokenExcessAmount,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenStakedAmount,
        uint256 baseTokenWalletBalance,
        uint256 tradeFeePPM,
        uint256 withdrawalFeePPM,
        uint256 basePoolTokenWithdrawalAmount
    ) external pure returns (WithdrawalAmounts memory) {
        return
            _withdrawalAmounts(
                networkTokenLiquidity,
                baseTokenLiquidity,
                baseTokenExcessAmount,
                basePoolTokenTotalSupply,
                baseTokenStakedAmount,
                baseTokenWalletBalance,
                tradeFeePPM,
                withdrawalFeePPM,
                basePoolTokenWithdrawalAmount
            );
    }
}
