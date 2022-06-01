// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { Time } from "../utility/Time.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IPendingWithdrawals, CompletedWithdrawal } from "../network/interfaces/IPendingWithdrawals.sol";
import { BancorNetwork } from "../network/BancorNetwork.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";

import { IPoolCollection, TradeAmountAndFee } from "../pools/interfaces/IPoolCollection.sol";
import { IPoolMigrator } from "../pools/interfaces/IPoolMigrator.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { Token } from "../token/Token.sol";

import { TestTime } from "./TestTime.sol";

contract TestBancorNetwork is BancorNetwork, TestTime {
    constructor(
        ITokenGovernance initBNTGovernance,
        ITokenGovernance initVBNTGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IExternalProtectionVault initExternalProtectionVault,
        IPoolToken initBNTPoolToken
    )
        BancorNetwork(
            initBNTGovernance,
            initVBNTGovernance,
            initNetworkSettings,
            initMasterVault,
            initExternalProtectionVault,
            initBNTPoolToken
        )
    {}

    function bntPool() external view returns (IBNTPool) {
        return _bntPool;
    }

    function pendingWithdrawals() external view returns (IPendingWithdrawals) {
        return _pendingWithdrawals;
    }

    function createPoolT(IPoolCollection poolCollection, Token token) external {
        poolCollection.createPool(token);
    }

    function migratePoolT(
        IPoolMigrator poolMigrator,
        Token pool,
        IPoolCollection newPoolCollection
    ) external {
        poolMigrator.migratePool(pool, newPoolCollection);
    }

    function completeWithdrawalT(
        bytes32 contextId,
        address provider,
        uint256 id
    ) external returns (CompletedWithdrawal memory) {
        return _pendingWithdrawals.completeWithdrawal(contextId, provider, id);
    }

    function depositToBNTPoolForT(
        bytes32 contextId,
        address provider,
        uint256 bntAmount,
        bool isMigrating,
        uint256 originalPoolTokenAmount
    ) external returns (uint256) {
        return _bntPool.depositFor(contextId, provider, bntAmount, isMigrating, originalPoolTokenAmount);
    }

    function depositToPoolCollectionForT(
        IPoolCollection poolCollection,
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 tokenAmount
    ) external returns (uint256) {
        return poolCollection.depositFor(contextId, provider, pool, tokenAmount);
    }

    function withdrawFromBNTPoolT(
        bytes32 contextId,
        address provider,
        uint256 poolTokenAmount,
        uint256 bntAmount
    ) external returns (uint256) {
        return _bntPool.withdraw(contextId, provider, poolTokenAmount, bntAmount);
    }

    function withdrawFromPoolCollectionT(
        IPoolCollection poolCollection,
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 poolTokenAmount,
        uint256 reserveTokenAmount
    ) external returns (uint256) {
        return poolCollection.withdraw(contextId, provider, pool, poolTokenAmount, reserveTokenAmount);
    }

    function onBNTFeesCollectedT(
        Token pool,
        uint256 amount,
        bool isTraderFee
    ) external {
        _bntPool.onFeesCollected(pool, amount, isTraderFee);
    }

    function onPoolCollectionFeesCollectedT(
        IPoolCollection poolCollection,
        Token pool,
        uint256 amount
    ) external {
        poolCollection.onFeesCollected(pool, amount);
    }

    function tradeBySourcePoolCollectionT(
        IPoolCollection poolCollection,
        bytes32 contextId,
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount,
        uint256 minReturnAmount
    ) external returns (TradeAmountAndFee memory) {
        return poolCollection.tradeBySourceAmount(contextId, sourceToken, targetToken, sourceAmount, minReturnAmount);
    }

    function tradeByTargetPoolCollectionT(
        IPoolCollection poolCollection,
        bytes32 contextId,
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount,
        uint256 maxSourceAmount
    ) external returns (TradeAmountAndFee memory) {
        return poolCollection.tradeByTargetAmount(contextId, sourceToken, targetToken, targetAmount, maxSourceAmount);
    }

    function _time() internal view virtual override(Time, TestTime) returns (uint32) {
        return TestTime._time();
    }
}
