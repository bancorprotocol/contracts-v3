// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../vaults/interfaces/IExternalProtectionVault.sol";
import { IExternalRewardsVault } from "../vaults/interfaces/IExternalRewardsVault.sol";

import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IPoolCollectionUpgrader } from "../pools/interfaces/IPoolCollectionUpgrader.sol";
import { IPoolCollection } from "../pools/interfaces/IPoolCollection.sol";
import { IMasterPool } from "../pools/interfaces/IMasterPool.sol";
import { TradeAmounts } from "../pools/interfaces/IPoolCollection.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { InvalidToken, Utils } from "../utility/Utils.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { IBancorNetworkInformation } from "./interfaces/IBancorNetworkInformation.sol";
import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "./interfaces/INetworkSettings.sol";
import { IPendingWithdrawals } from "./interfaces/IPendingWithdrawals.sol";

/**
 * @dev Bancor Network Information contract
 */
contract BancorNetworkInformation is IBancorNetworkInformation, Upgradeable, Utils {
    using ReserveTokenLibrary for ReserveToken;

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
        __BancorNetworkInformation_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorNetworkInformation_init() internal onlyInitializing {
        __Upgradeable_init();

        __BancorNetworkInformation_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorNetworkInformation_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    modifier validTokensForTrade(ReserveToken sourceToken, ReserveToken targetToken) {
        _validTokensForTrade(sourceToken, targetToken);

        _;
    }

    /**
     * @dev validates that the provided tokens are valid and unique
     */
    function _validTokensForTrade(ReserveToken sourceToken, ReserveToken targetToken) internal pure {
        _validAddress(ReserveToken.unwrap(sourceToken));
        _validAddress(ReserveToken.unwrap(targetToken));

        if (ReserveToken.unwrap(sourceToken) == ReserveToken.unwrap(targetToken)) {
            revert InvalidTokens();
        }
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function network() external view returns (IBancorNetwork) {
        return _network;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function networkToken() external view returns (IERC20) {
        return _networkToken;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function networkTokenGovernance() external view returns (ITokenGovernance) {
        return _networkTokenGovernance;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function govToken() external view returns (IERC20) {
        return _govToken;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function govTokenGovernance() external view returns (ITokenGovernance) {
        return _govTokenGovernance;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function networkSettings() external view returns (INetworkSettings) {
        return _networkSettings;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function masterVault() external view returns (IMasterVault) {
        return _masterVault;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function externalProtectionVault() external view returns (IExternalProtectionVault) {
        return _externalProtectionVault;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function externalRewardsVault() external view returns (IExternalRewardsVault) {
        return _externalRewardsVault;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function masterPool() external view returns (IMasterPool) {
        return _masterPool;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function masterPoolToken() external view returns (IPoolToken) {
        return _masterPoolToken;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function pendingWithdrawals() external view returns (IPendingWithdrawals) {
        return _pendingWithdrawals;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function poolCollectionUpgrader() external view returns (IPoolCollectionUpgrader) {
        return _poolCollectionUpgrader;
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function tradeTargetAmount(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount
    ) external view validTokensForTrade(sourceToken, targetToken) greaterThanZero(sourceAmount) returns (uint256) {
        return _tradeAmount(sourceToken, targetToken, sourceAmount, true);
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function tradeSourceAmount(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 targetAmount
    ) external view validTokensForTrade(sourceToken, targetToken) greaterThanZero(targetAmount) returns (uint256) {
        return _tradeAmount(sourceToken, targetToken, targetAmount, false);
    }

    /**
     * @inheritdoc IBancorNetworkInformation
     */
    function isReadyForWithdrawal(uint256 id) external view returns (bool) {
        return _pendingWithdrawals.isReadyForWithdrawal(id);
    }

    /**
     * @dev returns the target or source amount and fee by specifying the source and the target tokens and whether we're
     * interested in the target or source amount
     */
    function _tradeAmount(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 amount,
        bool targetAmount
    ) private view returns (uint256) {
        // return the trade amount and fee when trading the network token to the base token
        if (_isNetworkToken(sourceToken)) {
            return
                _poolCollection(targetToken).tradeAmountAndFee(sourceToken, targetToken, amount, targetAmount).amount;
        }

        // return the trade amount and fee when trading the base token to the network token
        if (_isNetworkToken(targetToken)) {
            return
                _poolCollection(sourceToken).tradeAmountAndFee(sourceToken, targetToken, amount, targetAmount).amount;
        }

        // return the trade amount and fee by simulating double-hop trade from the source token to the target token via
        // the network token
        TradeAmounts memory sourceTradeAmounts = _poolCollection(sourceToken).tradeAmountAndFee(
            sourceToken,
            ReserveToken.wrap(address(_networkToken)),
            amount,
            targetAmount
        );

        return
            _poolCollection(targetToken)
                .tradeAmountAndFee(
                    ReserveToken.wrap(address(_networkToken)),
                    targetToken,
                    sourceTradeAmounts.amount,
                    targetAmount
                )
                .amount;
    }

    /**
     * @dev verifies that the specified pool is managed by a valid pool collection and returns it
     */
    function _poolCollection(ReserveToken token) private view returns (IPoolCollection) {
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
    function _isNetworkToken(ReserveToken token) private view returns (bool) {
        return token.toIERC20() == _networkToken;
    }
}
