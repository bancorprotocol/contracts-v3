// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IBancorVault } from "../network/interfaces/IBancorVault.sol";

import { INetworkTokenPool } from "./interfaces/INetworkTokenPool.sol";
import { IPoolToken } from "./interfaces/IPoolToken.sol";

import { PoolToken } from "./PoolToken.sol";

/**
 * @dev Network Token Pool contract
 */
contract NetworkTokenPool is INetworkTokenPool, Upgradeable, Utils {
    // the network contract
    IBancorNetwork private immutable _network;

    // the vault contract
    IBancorVault private immutable _vault;

    // the network token pool token
    IPoolToken internal immutable _poolToken;

    // the total staked network token balance in the network
    uint256 private _stakedBalance;

    // a mapping between pools and their total minted amounts
    mapping(IReserveToken => uint256) private _mintedAmounts;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 2] private __gap;

    /**
     * @dev triggered when liquidity pools have requested liquidity
     */
    event LiquidityRequested(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        uint256 amountRequested,
        uint256 amountProvided,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when liquidity pools have renounced liquidity
     */
    event LiquidityRenounced(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        uint256 amountRenounced,
        uint256 poolTokenAmount
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        IBancorVault initVault,
        IPoolToken initPoolToken
    ) validAddress(address(initNetwork)) validAddress(address(initVault)) validAddress(address(initPoolToken)) {
        _network = initNetwork;
        _vault = initVault;
        _poolToken = initPoolToken;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __NetworkTokenPool_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __NetworkTokenPool_init() internal initializer {
        __NetworkTokenPool_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __NetworkTokenPool_init_unchained() internal initializer {
        _poolToken.acceptOwnership();
    }

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function network() external view override returns (IBancorNetwork) {
        return _network;
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function vault() external view override returns (IBancorVault) {
        return _vault;
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function poolToken() external view override returns (IPoolToken) {
        return _poolToken;
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function stakedBalance() external view override returns (uint256) {
        return _stakedBalance;
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function mintedAmounts(IReserveToken pool) external view override returns (uint256) {
        return _mintedAmounts[pool];
    }

    function requestLiquidity(
        bytes32 contextId,
        IReserveToken pool,
        uint256 amount
    ) external override {
        emit LiquidityRequested(contextId, pool, amount, 0, 0);
    }

    function renounceLiquidity(
        bytes32 contextId,
        IReserveToken pool,
        uint256 amount
    ) external override {
        emit LiquidityRenounced(contextId, pool, amount, 0);
    }
}
