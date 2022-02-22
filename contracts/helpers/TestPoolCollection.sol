// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";

import { IOmniVault } from "../vaults/interfaces/IOmniVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";

import { IOmniPool } from "../pools/interfaces/IOmniPool.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IPoolTokenFactory } from "../pools/interfaces/IPoolTokenFactory.sol";
import { IPoolCollectionUpgrader } from "../pools/interfaces/IPoolCollectionUpgrader.sol";
import { PoolCollection, Pool, PoolLiquidity, WithdrawalAmounts } from "../pools/PoolCollection.sol";
import { AverageRate } from "../pools/interfaces/IPoolCollection.sol";

import { BlockNumber } from "../utility/BlockNumber.sol";

import { Token } from "../token/Token.sol";

import { TestBlockNumber } from "./TestBlockNumber.sol";

contract TestPoolCollection is PoolCollection, TestBlockNumber {
    uint16 private immutable _version;

    constructor(
        uint16 initVersion,
        IBancorNetwork initNetwork,
        IERC20 initBNT,
        INetworkSettings initNetworkSettings,
        IOmniVault initOmniVault,
        IOmniPool initOmniPool,
        IExternalProtectionVault initExternalProtectionVault,
        IPoolTokenFactory initPoolTokenFactory,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    )
        PoolCollection(
            initNetwork,
            initBNT,
            initNetworkSettings,
            initOmniVault,
            initOmniPool,
            initExternalProtectionVault,
            initPoolTokenFactory,
            initPoolCollectionUpgrader
        )
    {
        _version = initVersion;
    }

    function version() external view override returns (uint16) {
        return _version;
    }

    function setTradingLiquidityT(Token pool, PoolLiquidity calldata liquidity) external {
        _poolData[pool].liquidity = liquidity;
    }

    function setAverageRateT(Token pool, AverageRate calldata newAverageRate) external {
        _poolData[pool].averageRate = newAverageRate;
    }

    function poolWithdrawalAmountsT(Token pool, uint256 poolTokenAmount)
        external
        view
        returns (WithdrawalAmounts memory)
    {
        return _poolWithdrawalAmounts(pool, poolTokenAmount);
    }

    function mintPoolTokenT(
        Token pool,
        address recipient,
        uint256 poolTokenAmount
    ) external {
        return _poolData[pool].poolToken.mint(recipient, poolTokenAmount);
    }

    function requestFundingT(
        bytes32 contextId,
        Token pool,
        uint256 bntAmount
    ) external {
        _omniPool.requestFunding(contextId, pool, bntAmount);
    }

    function _blockNumber() internal view virtual override(BlockNumber, TestBlockNumber) returns (uint32) {
        return TestBlockNumber._blockNumber();
    }
}
