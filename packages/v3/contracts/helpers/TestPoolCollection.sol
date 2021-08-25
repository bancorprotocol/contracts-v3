// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { INetworkTokenPool } from "../pools/interfaces/INetworkTokenPool.sol";
import { PoolCollection, Pool, WithdrawalAmounts } from "../pools/PoolCollection.sol";
import { AverageRate } from "../pools/PoolAverageRate.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

contract TestPoolCollection is PoolCollection {
    constructor(IBancorNetwork initNetwork, INetworkTokenPool initNeworkTokenPool)
        PoolCollection(initNetwork, initNeworkTokenPool)
    {}

    function mintT(
        address recipient,
        IPoolToken poolToken,
        uint256 amount
    ) external {
        poolToken.mint(recipient, amount);
    }

    function setTradingLiquidityT(
        IReserveToken reserveToken,
        uint128 baseTokenTradingLiquidity,
        uint128 networkTokenTradingLiquidity
    ) external {
        Pool storage data = _pools[reserveToken];
        data.liquidity.baseTokenTradingLiquidity = baseTokenTradingLiquidity;
        data.liquidity.networkTokenTradingLiquidity = networkTokenTradingLiquidity;
    }

    function setAverageRateT(IReserveToken reserveToken, AverageRate memory newAverageRate) external {
        Pool storage data = _pools[reserveToken];
        data.averageRate = newAverageRate;
    }

    function requestLiquidityT(
        INetworkTokenPool networkTokenPool,
        bytes32 contextId,
        IReserveToken pool,
        uint256 networkTokenAmount,
        bool skipLimitCheck
    ) external returns (uint256) {
        return networkTokenPool.requestLiquidity(contextId, pool, networkTokenAmount, skipLimitCheck);
    }

    function renounceLiquidityT(
        INetworkTokenPool networkTokenPool,
        bytes32 contextId,
        IReserveToken pool,
        uint256 networkTokenAmount
    ) external {
        networkTokenPool.renounceLiquidity(contextId, pool, networkTokenAmount);
    }

    function withdrawalAmountsT(
        uint256 networkTokenLiquidity,
        uint256 baseTokenLiquidity,
        uint256 baseTokenExcessAmount,
        uint256 basePoolTokenTotalSupply,
        uint256 baseTokenStakedAmount,
        uint256 baseTokenWalletBalance,
        uint256 tradeFee,
        uint256 withdrawalFee,
        uint256 basePoolTokenWithdrawalAmount
    ) external pure returns (WithdrawalAmounts memory) {
        return
            super._withdrawalAmounts(
                networkTokenLiquidity,
                baseTokenLiquidity,
                baseTokenExcessAmount,
                basePoolTokenTotalSupply,
                baseTokenStakedAmount,
                baseTokenWalletBalance,
                tradeFee,
                withdrawalFee,
                basePoolTokenWithdrawalAmount
            );
    }
}
