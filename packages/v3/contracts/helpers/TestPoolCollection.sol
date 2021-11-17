// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;
pragma abicoder v2;

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IPoolTokenFactory } from "../pools/interfaces/IPoolTokenFactory.sol";
import { IPoolCollectionUpgrader } from "../pools/interfaces/IPoolCollectionUpgrader.sol";
import { PoolCollection, Pool, PoolLiquidity, WithdrawalAmounts } from "../pools/PoolCollection.sol";
import { AverageRate } from "../pools/PoolAverageRate.sol";

import { Time } from "../utility/Time.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

import { TestTime } from "./TestTime.sol";

contract TestPoolCollection is PoolCollection, TestTime {
    uint16 private immutable _version;

    constructor(
        uint16 initVersion,
        IBancorNetwork initNetwork,
        IPoolTokenFactory initPoolTokenFactory,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    ) PoolCollection(initNetwork, initPoolTokenFactory, initPoolCollectionUpgrader) {
        _version = initVersion;
    }

    function version() external view override returns (uint16) {
        return _version;
    }

    function setTradingLiquidityT(ReserveToken reserveToken, PoolLiquidity calldata liquidity) external {
        _poolData[reserveToken].liquidity = liquidity;
    }

    function setAverageRateT(ReserveToken reserveToken, AverageRate calldata newAverageRate) external {
        _poolData[reserveToken].averageRate = newAverageRate;
    }

    function poolWithdrawalAmountsT(
        ReserveToken baseToken,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 externalProtectionVaultBalance
    ) external view returns (WithdrawalAmounts memory) {
        return
            _poolWithdrawalAmounts(
                baseToken,
                basePoolTokenAmount,
                baseTokenVaultBalance,
                externalProtectionVaultBalance
            );
    }

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}
