// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";
import { IExternalRewardsVault } from "../vaults/interfaces/IExternalRewardsVault.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IPoolMigrator } from "../pools/interfaces/IPoolMigrator.sol";
import { IPoolCollection, PoolLiquidity, WithdrawalAmounts } from "../pools/interfaces/IPoolCollection.sol";
import { IBNTPool } from "../pools/interfaces/IBNTPool.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, InvalidToken, InvalidParam } from "../utility/Utils.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IBancorNetworkInfo, TradingLiquidity } from "./interfaces/IBancorNetworkInfo.sol";
import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "./interfaces/INetworkSettings.sol";
import { IPendingWithdrawals } from "./interfaces/IPendingWithdrawals.sol";

/**
 * @dev Bancor Network Information contract
 */
contract BancorNetworkInfo is IBancorNetworkInfo, Upgradeable, Utils {
    using TokenLibrary for Token;

    // the address of the network
    IBancorNetwork private immutable _network;

    // the address of the BNT token
    IERC20 private immutable _bnt;

    // the address of the BNT token governance
    ITokenGovernance private immutable _bntGovernance;

    // the address of the vBNT token
    IERC20 private immutable _vbnt;

    // the address of the vBNT token governance
    ITokenGovernance private immutable _vbntGovernance;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the master vault contract
    IMasterVault private immutable _masterVault;

    // the address of the external protection vault
    IExternalProtectionVault private immutable _externalProtectionVault;

    // the address of the external rewards vault
    IExternalRewardsVault private immutable _externalRewardsVault;

    // the BNT pool contract
    IBNTPool private immutable _bntPool;

    // the BNT pool token
    IPoolToken private immutable _bntPoolToken;

    // the pending withdrawals contract
    IPendingWithdrawals private immutable _pendingWithdrawals;

    // the pool migrator contract
    IPoolMigrator private immutable _poolMigrator;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        ITokenGovernance initBNTGovernance,
        ITokenGovernance initVBNTGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IExternalProtectionVault initExternalProtectionVault,
        IExternalRewardsVault initExternalRewardsVault,
        IBNTPool initBNTPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolMigrator initPoolMigrator
    ) {
        _validAddress(address(initNetwork));
        _validAddress(address(initBNTGovernance));
        _validAddress(address(initVBNTGovernance));
        _validAddress(address(initNetworkSettings));
        _validAddress(address(initMasterVault));
        _validAddress(address(initExternalProtectionVault));
        _validAddress(address(initExternalRewardsVault));
        _validAddress(address(initBNTPool));
        _validAddress(address(initPendingWithdrawals));
        _validAddress(address(initPoolMigrator));

        _network = initNetwork;
        _bntGovernance = initBNTGovernance;
        _bnt = initBNTGovernance.token();
        _vbntGovernance = initVBNTGovernance;
        _vbnt = initVBNTGovernance.token();
        _networkSettings = initNetworkSettings;
        _masterVault = initMasterVault;
        _externalProtectionVault = initExternalProtectionVault;
        _externalRewardsVault = initExternalRewardsVault;
        _bntPool = initBNTPool;
        _bntPoolToken = initBNTPool.poolToken();
        _pendingWithdrawals = initPendingWithdrawals;
        _poolMigrator = initPoolMigrator;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __BancorNetworkInfo_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorNetworkInfo_init() internal onlyInitializing {
        __Upgradeable_init();

        __BancorNetworkInfo_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorNetworkInfo_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    modifier validTokensForTrade(Token sourceToken, Token targetToken) {
        _validTokensForTrade(sourceToken, targetToken);

        _;
    }

    /**
     * @dev validates that the provided tokens are valid and unique
     */
    function _validTokensForTrade(Token sourceToken, Token targetToken) internal pure {
        _validAddress(address(sourceToken));
        _validAddress(address(targetToken));

        if (sourceToken == targetToken) {
            revert InvalidToken();
        }
    }

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 2;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function network() external view returns (IBancorNetwork) {
        return _network;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function bnt() external view returns (IERC20) {
        return _bnt;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function bntGovernance() external view returns (ITokenGovernance) {
        return _bntGovernance;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function vbnt() external view returns (IERC20) {
        return _vbnt;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function vbntGovernance() external view returns (ITokenGovernance) {
        return _vbntGovernance;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function networkSettings() external view returns (INetworkSettings) {
        return _networkSettings;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function masterVault() external view returns (IMasterVault) {
        return _masterVault;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function externalProtectionVault() external view returns (IExternalProtectionVault) {
        return _externalProtectionVault;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function externalRewardsVault() external view returns (IExternalRewardsVault) {
        return _externalRewardsVault;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function bntPool() external view returns (IBNTPool) {
        return _bntPool;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function poolToken(Token pool) external view returns (IPoolToken) {
        return pool.isEqual(_bnt) ? _bntPoolToken : _poolCollection(pool).poolToken(pool);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function stakedBalance(Token pool) external view returns (uint256) {
        return pool.isEqual(_bnt) ? _bntPool.stakedBalance() : _poolCollection(pool).poolLiquidity(pool).stakedBalance;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function tradingLiquidity(Token pool) external view returns (TradingLiquidity memory) {
        if (pool.isEqual(_bnt)) {
            revert InvalidParam();
        }

        PoolLiquidity memory liquidity = _poolCollection(pool).poolLiquidity(pool);

        return
            TradingLiquidity({
                bntTradingLiquidity: liquidity.bntTradingLiquidity,
                baseTokenTradingLiquidity: liquidity.baseTokenTradingLiquidity
            });
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function tradingFeePPM(Token pool) external view returns (uint32) {
        if (pool.isEqual(_bnt)) {
            revert InvalidParam();
        }

        return _poolCollection(pool).tradingFeePPM(pool);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function tradingEnabled(Token pool) external view returns (bool) {
        return pool.isEqual(_bnt) ? true : _poolCollection(pool).tradingEnabled(pool);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function depositingEnabled(Token pool) external view returns (bool) {
        return pool.isEqual(_bnt) ? true : _poolCollection(pool).depositingEnabled(pool);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function isPoolStable(Token pool) external view returns (bool) {
        return pool.isEqual(_bnt) ? true : _poolCollection(pool).isPoolStable(pool);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function pendingWithdrawals() external view returns (IPendingWithdrawals) {
        return _pendingWithdrawals;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function poolMigrator() external view returns (IPoolMigrator) {
        return _poolMigrator;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function tradeOutputBySourceAmount(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount
    ) external view validTokensForTrade(sourceToken, targetToken) greaterThanZero(sourceAmount) returns (uint256) {
        return _tradeOutputAmount(sourceToken, targetToken, sourceAmount, true);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function tradeInputByTargetAmount(
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount
    ) external view validTokensForTrade(sourceToken, targetToken) greaterThanZero(targetAmount) returns (uint256) {
        return _tradeOutputAmount(sourceToken, targetToken, targetAmount, false);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function isReadyForWithdrawal(uint256 id) external view returns (bool) {
        return _pendingWithdrawals.isReadyForWithdrawal(id);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function poolTokenToUnderlying(Token pool, uint256 poolTokenAmount) external view returns (uint256) {
        return
            pool.isEqual(_bnt)
                ? _bntPool.poolTokenToUnderlying(poolTokenAmount)
                : _poolCollection(pool).poolTokenToUnderlying(pool, poolTokenAmount);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function underlyingToPoolToken(Token pool, uint256 tokenAmount) external view returns (uint256) {
        return
            pool.isEqual(_bnt)
                ? _bntPool.underlyingToPoolToken(tokenAmount)
                : _poolCollection(pool).underlyingToPoolToken(pool, tokenAmount);
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function withdrawalAmounts(Token pool, uint256 poolTokenAmount)
        external
        view
        validAddress(address(pool))
        greaterThanZero(poolTokenAmount)
        returns (WithdrawalAmounts memory)
    {
        if (pool.isEqual(_bnt)) {
            uint256 amount = _bntPool.withdrawalAmount(poolTokenAmount);
            return WithdrawalAmounts({ totalAmount: amount, baseTokenAmount: 0, bntAmount: amount });
        }

        IPoolCollection poolCollection = _poolCollection(pool);
        return poolCollection.withdrawalAmounts(pool, poolTokenAmount);
    }

    /**
     * @dev returns either the source amount or the target amount by providing the source and the target tokens
     * and whether we're interested in the target or the source amount
     */
    function _tradeOutputAmount(
        Token sourceToken,
        Token targetToken,
        uint256 amount,
        bool bySourceAmount
    ) private view returns (uint256) {
        bool isSourceBNT = sourceToken.isEqual(_bnt);
        bool isTargetBNT = targetToken.isEqual(_bnt);

        // return the trade amount when trading BNT
        if (isSourceBNT || isTargetBNT) {
            Token token = isSourceBNT ? targetToken : sourceToken;
            IPoolCollection poolCollection = _poolCollection(token);

            return
                (
                    bySourceAmount
                        ? poolCollection.tradeOutputAndFeeBySourceAmount(sourceToken, targetToken, amount)
                        : poolCollection.tradeInputAndFeeByTargetAmount(sourceToken, targetToken, amount)
                ).amount;
        }

        // return the target amount by simulating double-hop trade from the source token to the target token via BNT
        if (bySourceAmount) {
            uint256 targetAmount = _poolCollection(sourceToken)
                .tradeOutputAndFeeBySourceAmount(sourceToken, Token(address(_bnt)), amount)
                .amount;

            return
                _poolCollection(targetToken)
                    .tradeOutputAndFeeBySourceAmount(Token(address(_bnt)), targetToken, targetAmount)
                    .amount;
        }

        // return the source amount by simulating a "reverse" double-hop trade from the source token to the target token
        // via BNT
        uint256 requireNetworkAmount = _poolCollection(targetToken)
            .tradeInputAndFeeByTargetAmount(Token(address(_bnt)), targetToken, amount)
            .amount;

        return
            _poolCollection(sourceToken)
                .tradeInputAndFeeByTargetAmount(sourceToken, Token(address(_bnt)), requireNetworkAmount)
                .amount;
    }

    /**
     * @dev verifies that the specified pool is managed by a valid pool collection and returns it
     */
    function _poolCollection(Token token) private view returns (IPoolCollection) {
        // verify that the pool is managed by a valid pool collection
        IPoolCollection poolCollection = _network.collectionByPool(token);
        if (address(poolCollection) == address(0)) {
            revert InvalidToken();
        }

        return poolCollection;
    }
}
