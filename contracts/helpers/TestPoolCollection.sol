// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";

import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IPoolTokenFactory } from "../pools/interfaces/IPoolTokenFactory.sol";
import { IPoolMigrator } from "../pools/interfaces/IPoolMigrator.sol";
import { PoolCollection, Pool, PoolLiquidity, InternalWithdrawalAmounts, PoolRateState } from "../pools/PoolCollection.sol";
import { AverageRates } from "../pools/interfaces/IPoolCollection.sol";

import { BlockNumber } from "../utility/BlockNumber.sol";

import { Token } from "../token/Token.sol";

import { TestBlockNumber } from "./TestBlockNumber.sol";

contract TestPoolCollection is PoolCollection, TestBlockNumber {
    uint16 private immutable _poolType;
    uint16 private immutable _version;

    constructor(
        uint16 initPoolType,
        uint16 initVersion,
        IBancorNetwork initNetwork,
        IERC20 initBNT,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IBNTPool initBNTPool,
        IExternalProtectionVault initExternalProtectionVault,
        IPoolTokenFactory initPoolTokenFactory,
        IPoolMigrator initPoolMigrator
    )
        PoolCollection(
            initNetwork,
            initBNT,
            initNetworkSettings,
            initMasterVault,
            initBNTPool,
            initExternalProtectionVault,
            initPoolTokenFactory,
            initPoolMigrator
        )
    {
        _poolType = initPoolType;
        _version = initVersion;
    }

    function poolType() external view override returns (uint16) {
        return _poolType;
    }

    function version() external view override returns (uint16) {
        return _version;
    }

    function setTradingLiquidityT(Token pool, PoolLiquidity calldata liquidity) external {
        _poolData[pool].liquidity = liquidity;
    }

    function setAverageRatesT(Token pool, AverageRates calldata newAverageRates) external {
        _poolData[pool].averageRates = newAverageRates;
    }

    function poolWithdrawalAmountsT(
        Token pool,
        uint256 poolTokenAmount,
        uint256 baseTokensWithdrawalAmount
    ) external view returns (InternalWithdrawalAmounts memory) {
        Pool storage data = _poolData[pool];

        return
            _poolWithdrawalAmounts(
                pool,
                poolTokenAmount,
                baseTokensWithdrawalAmount,
                data.liquidity,
                data.tradingFeePPM,
                data.poolToken.totalSupply()
            );
    }

    function mintPoolTokenT(Token pool, address recipient, uint256 poolTokenAmount) external {
        return _poolData[pool].poolToken.mint(recipient, poolTokenAmount);
    }

    function requestFundingT(bytes32 contextId, Token pool, uint256 bntAmount) external {
        _bntPool.requestFunding(contextId, pool, bntAmount);
    }

    function _blockNumber() internal view virtual override(BlockNumber, TestBlockNumber) returns (uint32) {
        return TestBlockNumber._blockNumber();
    }
}
