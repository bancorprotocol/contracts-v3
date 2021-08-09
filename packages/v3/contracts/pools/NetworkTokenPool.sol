// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";

import { ITokenGovernance } from "@bancor/token-governance/0.7.6/contracts/TokenGovernance.sol";

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
    using SafeMath for uint256;

    // the network contract
    IBancorNetwork private immutable _network;

    // the address of the network token
    IERC20 private immutable _networkToken;

    // the address of the network token governance
    ITokenGovernance private immutable _networkTokenGovernance;

    // the address of the governance token
    IERC20 private immutable _govToken;

    // the address of the governance token governance
    ITokenGovernance private immutable _govTokenGovernance;

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
        _networkToken = initNetwork.networkToken();
        _networkTokenGovernance = initNetwork.networkTokenGovernance();
        _govToken = initNetwork.govToken();
        _govTokenGovernance = initNetwork.govTokenGovernance();
        _vault = initVault;
        _poolToken = initPoolToken;
    }

    // allows execution by the network only
    modifier onlyNetwork() {
        _onlyNetwork();

        _;
    }

    function _onlyNetwork() private view {
        require(msg.sender == address(_network), "ERR_ACCESS_DENIED");
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
    function networkToken() external view override returns (IERC20) {
        return _networkToken;
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function networkTokenGovernance() external view override returns (ITokenGovernance) {
        return _networkTokenGovernance;
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function govToken() external view override returns (IERC20) {
        return _govToken;
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function govTokenGovernance() external view override returns (ITokenGovernance) {
        return _govTokenGovernance;
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

    /**
     * @inheritdoc INetworkTokenPool
     */
    function onFeesCollected(
        IReserveToken pool,
        uint256 amount,
        uint8 feeType
    ) external override onlyNetwork validAddress(address(pool)) greaterThanZero(amount) {
        // increase the staked balance by the given amount
        _stakedBalance = _stakedBalance.add(amount);

        // type 0: trading fee
        if (feeType == 0) {
            // increase the minted amount for the specified pool by the given amount
            _mintedAmounts[pool] = _mintedAmounts[pool].add(amount);
        }
    }
}
