// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;
pragma abicoder v2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import { ITokenGovernance } from "@bancor/token-governance/0.7.6/contracts/TokenGovernance.sol";

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Fraction } from "../utility/Types.sol";
import { MathEx } from "../utility/MathEx.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IBancorVault } from "../network/interfaces/IBancorVault.sol";
import { IPendingWithdrawals, WithdrawalRequest } from "../network/interfaces/IPendingWithdrawals.sol";

import { INetworkTokenPool, DepositAmounts, WithdrawalAmounts } from "./interfaces/INetworkTokenPool.sol";
import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolCollection, Pool } from "./interfaces/IPoolCollection.sol";

import { PoolToken } from "./PoolToken.sol";
import { PoolAverageRate } from "./PoolAverageRate.sol";

/**
 * @dev Network Token Pool contract
 */
contract NetworkTokenPool is INetworkTokenPool, Upgradeable, ReentrancyGuardUpgradeable, Utils {
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

    // the network settings contract
    INetworkSettings private immutable _settings;

    // the vault contract
    IBancorVault private immutable _vault;

    // the network token pool token
    IPoolToken internal immutable _poolToken;

    // the pending withdrawals contract
    IPendingWithdrawals private immutable _pendingWithdrawals;

    // the total staked network token balance in the network
    uint256 internal _stakedBalance;

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
        uint256 networkTokenAmount,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when liquidity pools have renounced liquidity
     */
    event LiquidityRenounced(
        bytes32 indexed contextId,
        IReserveToken indexed pool,
        uint256 networkTokenAmountRenounced,
        uint256 poolTokenAmount
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        IPendingWithdrawals initPendingWithdrawals,
        IPoolToken initPoolToken
    )
        validAddress(address(initNetwork))
        validAddress(address(initPendingWithdrawals))
        validAddress(address(initPoolToken))
    {
        _network = initNetwork;
        _networkToken = initNetwork.networkToken();
        _networkTokenGovernance = initNetwork.networkTokenGovernance();
        _govToken = initNetwork.govToken();
        _govTokenGovernance = initNetwork.govTokenGovernance();
        _settings = initNetwork.settings();
        _vault = initNetwork.vault();
        _pendingWithdrawals = initPendingWithdrawals;
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
        __ReentrancyGuard_init();

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
    function settings() external view override returns (INetworkSettings) {
        return _settings;
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
     *  @inheritdoc INetworkTokenPool
     */
    function pendingWithdrawals() external view override returns (IPendingWithdrawals) {
        return _pendingWithdrawals;
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
    function mintedAmount(IReserveToken pool) external view override returns (uint256) {
        return _mintedAmounts[pool];
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function isMintingEnabled(IReserveToken pool, IPoolCollection poolCollection)
        external
        view
        override
        returns (bool)
    {
        return
            address(pool) != address(0x0) &&
            address(poolCollection) != address(0x0) &&
            _settings.isTokenWhitelisted(pool) &&
            poolCollection.isPoolRateStable(pool);
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function availableMintingAmount(IReserveToken pool) external view override returns (uint256) {
        return MathEx.max0(_settings.poolMintingLimit(pool), _mintedAmounts[pool]);
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function mint(address recipient, uint256 networkTokenAmount)
        external
        override
        only(address(_network))
        validAddress(recipient)
        greaterThanZero(networkTokenAmount)
    {
        _networkTokenGovernance.mint(recipient, networkTokenAmount);
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function burnFromVault(uint256 networkTokenAmount)
        external
        override
        only(address(_network))
        greaterThanZero(networkTokenAmount)
    {
        _vault.withdrawTokens(IReserveToken(address(_networkToken)), payable(address(this)), networkTokenAmount);

        _networkTokenGovernance.burn(networkTokenAmount);
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function depositFor(
        address provider,
        uint256 networkTokenAmount,
        bool isMigrating,
        uint256 originalGovTokenAmount
    )
        external
        override
        only(address(_network))
        validAddress(provider)
        greaterThanZero(networkTokenAmount)
        returns (DepositAmounts memory)
    {
        // calculate the pool token amount to transfer
        uint256 poolTokenAmount = MathEx.mulDivF(networkTokenAmount, _poolToken.totalSupply(), _stakedBalance);

        // transfer pool tokens from the protocol to the provider. Please note that it's not possible to deposit
        // liquidity requiring the protocol to transfer the provider more protocol tokens than it holds
        _poolToken.transfer(provider, poolTokenAmount);

        // burn the previously received network tokens
        _networkTokenGovernance.burn(networkTokenAmount);

        uint256 govTokenAmount = poolTokenAmount;

        // the provider should receive pool tokens and gov tokens in equal amounts. since the provider might already
        // have some gov tokens during migration, the contract only mints the delta between the full amount and the
        // amount the provider already has
        if (isMigrating) {
            govTokenAmount = govTokenAmount > originalGovTokenAmount ? govTokenAmount - originalGovTokenAmount : 0;
        }

        // mint governance tokens to the provider
        if (govTokenAmount > 0) {
            _govTokenGovernance.mint(provider, govTokenAmount);
        }

        return
            DepositAmounts({
                networkTokenAmount: networkTokenAmount,
                poolTokenAmount: poolTokenAmount,
                govTokenAmount: govTokenAmount
            });
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function withdraw(address provider, uint256 poolTokenAmount)
        external
        override
        only(address(_network))
        greaterThanZero(poolTokenAmount)
        validAddress(provider)
        returns (WithdrawalAmounts memory)
    {
        WithdrawalAmounts memory amounts = _withdrawalAmounts(poolTokenAmount);

        // get the pool tokens from the caller
        _poolToken.transferFrom(msg.sender, address(this), poolTokenAmount);

        // burn the respective governance token amount
        _govTokenGovernance.burn(poolTokenAmount);

        // mint network tokens to the provider
        _networkTokenGovernance.mint(provider, amounts.networkTokenAmount);

        return
            WithdrawalAmounts({
                networkTokenAmount: amounts.networkTokenAmount,
                poolTokenAmount: poolTokenAmount,
                govTokenAmount: poolTokenAmount,
                networkTokenWithdrawalFeeAmount: amounts.networkTokenWithdrawalFeeAmount
            });
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function requestLiquidity(
        bytes32 contextId,
        IReserveToken pool,
        uint256 networkTokenAmount
    ) external override only(address(_network)) validAddress(address(pool)) greaterThanZero(networkTokenAmount) {
        uint256 currentMintedAmount = _mintedAmounts[pool];
        uint256 mintingLimit = _settings.poolMintingLimit(pool);
        uint256 newMintedAmount = currentMintedAmount.add(networkTokenAmount);

        // verify that new minted amount doesn't exceed the limit
        require(newMintedAmount <= mintingLimit, "ERR_INVALID_AMOUNT");

        // calculate the pool token amount to mint
        uint256 currentStakedBalance = _stakedBalance;
        uint256 poolTokenAmount;
        {
            uint256 poolTokenTotalSupply = _poolToken.totalSupply();
            if (poolTokenTotalSupply == 0) {
                // if this is the initial liquidity provision - use a one-to-one pool token to network token rate
                require(currentStakedBalance == 0, "ERR_INVALID_STAKED_BALANCE");

                poolTokenAmount = networkTokenAmount;
            } else {
                poolTokenAmount = MathEx.mulDivF(networkTokenAmount, poolTokenTotalSupply, currentStakedBalance);
            }
        }

        // update the staked balance
        _stakedBalance = currentStakedBalance.add(networkTokenAmount);

        // update the current minted amount
        _mintedAmounts[pool] = newMintedAmount;

        // mint pool tokens to the protocol
        _poolToken.mint(address(this), poolTokenAmount);

        // mint network tokens to the vault
        _networkTokenGovernance.mint(address(_vault), networkTokenAmount);

        emit LiquidityRequested({
            contextId: contextId,
            pool: pool,
            networkTokenAmount: networkTokenAmount,
            poolTokenAmount: poolTokenAmount
        });
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function renounceLiquidity(
        bytes32 contextId,
        IReserveToken pool,
        uint256 networkTokenAmount
    ) external override only(address(_network)) validAddress(address(pool)) greaterThanZero(networkTokenAmount) {
        uint256 currentStakedBalance = _stakedBalance;

        // calculate the pool token amount to burn
        uint256 poolTokenAmount = MathEx.mulDivF(networkTokenAmount, _poolToken.totalSupply(), currentStakedBalance);

        // update the staked balance
        _stakedBalance = currentStakedBalance.sub(networkTokenAmount);

        // update the current minted amount. Note that the given amount can be higher than the minted amount but the
        // request shouldn’t fail (and the minted amount cannot get negative)
        _mintedAmounts[pool] = MathEx.max0(_mintedAmounts[pool], networkTokenAmount);

        // burn pool tokens from the protocol
        _poolToken.burn(poolTokenAmount);

        // withdraw network tokens from the vault and burn them
        _vault.withdrawTokens(IReserveToken(address(_networkToken)), payable(address(this)), networkTokenAmount);
        _networkTokenGovernance.burn(networkTokenAmount);

        emit LiquidityRenounced({
            contextId: contextId,
            pool: pool,
            networkTokenAmountRenounced: networkTokenAmount,
            poolTokenAmount: poolTokenAmount
        });
    }

    /**
     * @inheritdoc INetworkTokenPool
     */
    function onFeesCollected(
        IReserveToken pool,
        uint256 networkTokenAmount,
        uint8 feeType
    ) external override only(address(_network)) validAddress(address(pool)) {
        if (networkTokenAmount == 0) {
            return;
        }

        // increase the staked balance by the given amount
        _stakedBalance = _stakedBalance.add(networkTokenAmount);

        // type 0: trading fee
        if (feeType == 0) {
            // increase the minted amount for the specified pool by the given amount
            _mintedAmounts[pool] = _mintedAmounts[pool].add(networkTokenAmount);
        }
    }

    /**
     * @dev returns withdrawal amounts
     */
    function _withdrawalAmounts(uint256 poolTokenAmount) internal view returns (WithdrawalAmounts memory) {
        // calculate the network token amount to transfer
        uint256 networkTokenAmount = MathEx.mulDivF(poolTokenAmount, _stakedBalance, _poolToken.totalSupply());

        // deduct the exit fee from the network token amount
        uint256 networkTokenWithdrawalFeeAmount = MathEx.mulDivF(
            networkTokenAmount,
            _settings.withdrawalFeePPM(),
            PPM_RESOLUTION
        );
        networkTokenAmount = networkTokenAmount.sub(networkTokenWithdrawalFeeAmount);

        return
            WithdrawalAmounts({
                networkTokenAmount: networkTokenAmount,
                poolTokenAmount: poolTokenAmount,
                govTokenAmount: poolTokenAmount,
                networkTokenWithdrawalFeeAmount: networkTokenWithdrawalFeeAmount
            });
    }
}
