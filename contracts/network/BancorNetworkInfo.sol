// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";
import { IExternalRewardsVault } from "../vaults/interfaces/IExternalRewardsVault.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IPoolCollectionUpgrader } from "../pools/interfaces/IPoolCollectionUpgrader.sol";
import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { InvalidToken, Utils } from "../utility/Utils.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IBancorNetworkInfo } from "./interfaces/IBancorNetworkInfo.sol";
import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "./interfaces/INetworkSettings.sol";
import { IPendingWithdrawals } from "./interfaces/IPendingWithdrawals.sol";

/**
 * @dev Bancor Network Information contract
 */
contract BancorNetworkInfo is IBancorNetworkInfo, Upgradeable, Utils {
    using TokenLibrary for Token;

    error InvalidTokens();

    // the address of the network
    IBancorNetwork private immutable _network;

    // the address of the network token
    IERC20 private immutable _networkToken;

    // the address of the network token governance
    ITokenGovernance private immutable _networkTokenGovernance;

    // the address of the governance token
    IERC20 private immutable _govToken;

    // the address of the governance token governance
    ITokenGovernance private immutable _govTokenGovernance;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the master vault contract
    IMasterVault private immutable _masterVault;

    // the address of the external protection vault
    IExternalProtectionVault private immutable _externalProtectionVault;

    // the address of the external protection vault
    IExternalRewardsVault private immutable _externalRewardsVault;

    // the master pool contract
    IMasterPool private immutable _masterPool;

    // the master pool token
    IPoolToken private immutable _masterPoolToken;

    // the pending withdrawals contract
    IPendingWithdrawals private immutable _pendingWithdrawals;

    // the pool collection upgrader contract
    IPoolCollectionUpgrader private immutable _poolCollectionUpgrader;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IExternalProtectionVault initExternalProtectionVault,
        IExternalRewardsVault initExternalRewardsVault,
        IMasterPool initMasterPool,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolCollectionUpgrader initPoolCollectionUpgrader
    ) {
        _validAddress(address(initNetwork));
        _validAddress(address(initNetworkTokenGovernance));
        _validAddress(address(initGovTokenGovernance));
        _validAddress(address(initNetworkSettings));
        _validAddress(address(initMasterVault));
        _validAddress(address(initExternalProtectionVault));
        _validAddress(address(initExternalRewardsVault));
        _validAddress(address(initMasterPool));
        _validAddress(address(initPendingWithdrawals));
        _validAddress(address(initPoolCollectionUpgrader));

        _network = initNetwork;
        _networkTokenGovernance = initNetworkTokenGovernance;
        _networkToken = initNetworkTokenGovernance.token();
        _govTokenGovernance = initGovTokenGovernance;
        _govToken = initGovTokenGovernance.token();
        _networkSettings = initNetworkSettings;
        _masterVault = initMasterVault;
        _externalProtectionVault = initExternalProtectionVault;
        _externalRewardsVault = initExternalRewardsVault;
        _masterPool = initMasterPool;
        _masterPoolToken = initMasterPool.poolToken();
        _pendingWithdrawals = initPendingWithdrawals;
        _poolCollectionUpgrader = initPoolCollectionUpgrader;
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
            revert InvalidTokens();
        }
    }

    /**
     * @inheritdoc IVersioned
     */
    function version() external pure returns (uint16) {
        return 1;
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
    function networkToken() external view returns (IERC20) {
        return _networkToken;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function networkTokenGovernance() external view returns (ITokenGovernance) {
        return _networkTokenGovernance;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function govToken() external view returns (IERC20) {
        return _govToken;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function govTokenGovernance() external view returns (ITokenGovernance) {
        return _govTokenGovernance;
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
    function masterPool() external view returns (IMasterPool) {
        return _masterPool;
    }

    /**
     * @inheritdoc IBancorNetworkInfo
     */
    function masterPoolToken() external view returns (IPoolToken) {
        return _masterPoolToken;
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
    function poolCollectionUpgrader() external view returns (IPoolCollectionUpgrader) {
        return _poolCollectionUpgrader;
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
     * @dev returns either the source amount or the target amount by providing the source and the target tokens
     * and whether we're interested in the target or the source amount
     */
    function _tradeOutputAmount(
        Token sourceToken,
        Token targetToken,
        uint256 amount,
        bool bySourceAmount
    ) private view returns (uint256) {
        bool isSourceNetworkToken = _isNetworkToken(sourceToken);
        bool isTargetNetworkToken = _isNetworkToken(targetToken);

        // return the trade amount when trading the network token
        if (isSourceNetworkToken || isTargetNetworkToken) {
            Token token = isSourceNetworkToken ? targetToken : sourceToken;
            IPoolCollection poolCollection = _poolCollection(token);

            return
                (
                    bySourceAmount
                        ? poolCollection.tradeOutputAndFeeBySourceAmount(sourceToken, targetToken, amount)
                        : poolCollection.tradeInputAndFeeByTargetAmount(sourceToken, targetToken, amount)
                ).amount;
        }

        // return the target amount by simulating double-hop trade from the source token to the target token via the
        // network token
        if (bySourceAmount) {
            uint256 targetAmount = _poolCollection(sourceToken)
                .tradeOutputAndFeeBySourceAmount(sourceToken, Token(address(_networkToken)), amount)
                .amount;

            return
                _poolCollection(targetToken)
                    .tradeOutputAndFeeBySourceAmount(Token(address(_networkToken)), targetToken, targetAmount)
                    .amount;
        }

        // return the source amount by simulating a "reverse" double-hop trade from the source token to the target token
        // via the network token
        uint256 requireNetworkAmount = _poolCollection(targetToken)
            .tradeInputAndFeeByTargetAmount(Token(address(_networkToken)), targetToken, amount)
            .amount;

        return
            _poolCollection(sourceToken)
                .tradeInputAndFeeByTargetAmount(sourceToken, Token(address(_networkToken)), requireNetworkAmount)
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

    /**
     * @dev returns whether the specified token is the network token
     */
    function _isNetworkToken(Token token) private view returns (bool) {
        return token.isEqual(_networkToken);
    }
}
