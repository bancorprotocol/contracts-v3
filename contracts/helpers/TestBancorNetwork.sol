// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { Time } from "../utility/Time.sol";

import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { CompletedWithdrawal } from "../network/interfaces/IPendingWithdrawals.sol";
import { BancorNetwork } from "../network/BancorNetwork.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";

import { IPoolCollection, TradeAmounts } from "../pools/interfaces/IPoolCollection.sol";
import { IPoolCollectionUpgrader } from "../pools/interfaces/IPoolCollectionUpgrader.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";

import { Token } from "../token/Token.sol";

import { TestTime } from "./TestTime.sol";

contract TestBancorNetwork is BancorNetwork, TestTime {
    using SafeERC20 for IERC20;

    constructor(
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IExternalProtectionVault initExternalProtectionVault,
        IPoolToken initMasterPoolToken
    )
        BancorNetwork(
            initNetworkTokenGovernance,
            initGovTokenGovernance,
            initNetworkSettings,
            initMasterVault,
            initExternalProtectionVault,
            initMasterPoolToken
        )
    {}

    function createPoolT(IPoolCollection poolCollection, Token token) external {
        poolCollection.createPool(token);
    }

    function upgradePoolT(IPoolCollectionUpgrader poolCollectionUpgrader, Token pool)
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

    function depositToMasterPoolForT(
        bytes32 contextId,
        address provider,
        uint256 networkTokenAmount,
        bool isMigrating,
        uint256 originalPoolTokenAmount
    ) external {
        _masterPool.depositFor(contextId, provider, networkTokenAmount, isMigrating, originalPoolTokenAmount);
    }

    function depositToPoolCollectionForT(
        IPoolCollection poolCollection,
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 tokenAmount
    ) external {
        poolCollection.depositFor(contextId, provider, pool, tokenAmount);
    }

    function withdrawFromMasterPoolT(
        bytes32 contextId,
        address provider,
        uint256 poolTokenAmount
    ) external {
        _masterPool.withdraw(contextId, provider, poolTokenAmount);
    }

    function withdrawFromPoolCollectionT(
        IPoolCollection poolCollection,
        bytes32 contextId,
        address provider,
        Token pool,
        uint256 poolTokenAmount
    ) external {
        poolCollection.withdraw(contextId, provider, pool, poolTokenAmount);
    }

    function onNetworkTokenFeesCollectedT(
        Token pool,
        uint256 amount,
        uint8 feeType
    ) external {
        _masterPool.onFeesCollected(pool, amount, feeType);
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
    ) external returns (TradeAmounts memory) {
        return poolCollection.tradeBySourceAmount(contextId, sourceToken, targetToken, sourceAmount, minReturnAmount);
    }

    function tradeByTargetPoolCollectionT(
        IPoolCollection poolCollection,
        bytes32 contextId,
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount,
        uint256 maxSourceAmount
    ) external returns (TradeAmounts memory) {
        return poolCollection.tradeByTargetAmount(contextId, sourceToken, targetToken, targetAmount, maxSourceAmount);
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
