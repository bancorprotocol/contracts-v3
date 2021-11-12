// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { Time } from "../utility/Time.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IBancorVault } from "../vaults/interfaces/IBancorVault.sol";
import { IPendingWithdrawals, CompletedWithdrawal } from "../network/interfaces/IPendingWithdrawals.sol";
import { BancorNetwork } from "../network/BancorNetwork.sol";

// prettier-ignore
import { IPoolCollection,
    DepositAmounts as PoolCollectionDepositAmounts,
    WithdrawalAmounts as PoolCollectionWithdrawalAmounts,
    TradeAmountsWithLiquidity
} from "../pools/interfaces/IPoolCollection.sol";

import { IPoolCollectionUpgrader } from "../pools/interfaces/IPoolCollectionUpgrader.sol";

// prettier-ignore
import {
    INetworkTokenPool,
    DepositAmounts as NetworkTokenPoolDepositAmounts,
    WithdrawalAmounts as NetworkTokenPoolWithdrawalAmounts
} from "../pools/interfaces/INetworkTokenPool.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

import { TestTime } from "./TestTime.sol";

contract TestBancorNetwork is BancorNetwork, TestTime {
    using SafeERC20 for IERC20;

    constructor(
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initSettings,
        IBancorVault initVault,
        IPoolToken initNetworkPoolToken
    )
        BancorNetwork(initNetworkTokenGovernance, initGovTokenGovernance, initSettings, initVault, initNetworkPoolToken)
    {}

    function createPoolT(IPoolCollection poolCollection, ReserveToken reserveToken) external {
        poolCollection.createPool(reserveToken);
    }

    function upgradePoolT(IPoolCollectionUpgrader poolCollectionUpgrader, ReserveToken pool)
        external
        returns (IPoolCollection)
    {
        return poolCollectionUpgrader.upgradePool(pool);
    }

    function completeWithdrawalT(
        bytes32 contextId,
        address provider,
        uint256 id
    ) external returns (CompletedWithdrawal memory) {
        return _pendingWithdrawals.completeWithdrawal(contextId, provider, id);
    }

    function mintT(address recipient, uint256 networkTokenAmount) external {
        return _networkTokenPool.mint(recipient, networkTokenAmount);
    }

    function burnFromVaultT(uint256 networkTokenAmount) external {
        return _networkTokenPool.burnFromVault(networkTokenAmount);
    }

    function depositToNetworkPoolForT(
        address provider,
        uint256 networkTokenAmount,
        bool isMigrating,
        uint256 originalPoolTokenAmount
    ) external returns (NetworkTokenPoolDepositAmounts memory) {
        return _networkTokenPool.depositFor(provider, networkTokenAmount, isMigrating, originalPoolTokenAmount);
    }

    function depositToPoolCollectionForT(
        IPoolCollection poolCollection,
        address provider,
        ReserveToken pool,
        uint256 baseTokenAmount,
        uint256 unallocatedNetworkTokenLiquidity
    ) external returns (PoolCollectionDepositAmounts memory) {
        return poolCollection.depositFor(provider, pool, baseTokenAmount, unallocatedNetworkTokenLiquidity);
    }

    function withdrawFromNetworkPoolT(address provider, uint256 poolTokenAmount)
        external
        returns (NetworkTokenPoolWithdrawalAmounts memory)
    {
        return _networkTokenPool.withdraw(provider, poolTokenAmount);
    }

    function withdrawFromPoolCollectionT(
        IPoolCollection poolCollection,
        ReserveToken pool,
        uint256 basePoolTokenAmount,
        uint256 baseTokenVaultBalance,
        uint256 externalProtectionWalletBalance
    ) external returns (PoolCollectionWithdrawalAmounts memory) {
        return
            poolCollection.withdraw(pool, basePoolTokenAmount, baseTokenVaultBalance, externalProtectionWalletBalance);
    }

    function requestLiquidityT(
        bytes32 contextId,
        ReserveToken pool,
        uint256 networkTokenAmount
    ) external {
        _networkTokenPool.requestLiquidity(contextId, pool, networkTokenAmount);
    }

    function renounceLiquidityT(
        bytes32 contextId,
        ReserveToken pool,
        uint256 networkTokenAmount
    ) external {
        _networkTokenPool.renounceLiquidity(contextId, pool, networkTokenAmount);
    }

    function onNetworkTokenFeesCollectedT(
        ReserveToken pool,
        uint256 amount,
        uint8 feeType
    ) external {
        _networkTokenPool.onFeesCollected(pool, amount, feeType);
    }

    function onPoolCollectionFeesCollectedT(
        IPoolCollection poolCollection,
        ReserveToken pool,
        uint256 amount
    ) external {
        poolCollection.onFeesCollected(pool, amount);
    }

    function tradePoolCollectionT(
        IPoolCollection poolCollection,
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount
    ) external returns (TradeAmountsWithLiquidity memory) {
        return poolCollection.trade(sourceToken, targetToken, sourceAmount, minReturnAmount);
    }

    function approveT(
        IERC20 token,
        address spender,
        uint256 amount
    ) external {
        token.safeApprove(spender, amount);
    }

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}
