// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;
pragma abicoder v2;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { ReserveToken } from "../token/ReserveToken.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils, InvalidStakedBalance } from "../utility/Utils.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { Fraction } from "../utility/Types.sol";
import { MathEx } from "../utility/MathEx.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";

import { TRADING_FEE } from "../network/FeeTypes.sol";

import { IMasterPool, DepositAmounts, WithdrawalAmounts } from "./interfaces/IMasterPool.sol";
import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { IPoolCollection, Pool } from "./interfaces/IPoolCollection.sol";

import { ReserveToken, ReserveTokenLibrary } from "../token/ReserveToken.sol";

import { Vault } from "../vaults/Vault.sol";
import { IVault } from "../vaults/interfaces/IVault.sol";

import { PoolToken } from "./PoolToken.sol";

/**
 * @dev Master Pool contract
 */
contract MasterPool is IMasterPool, Vault {
    using ReserveTokenLibrary for ReserveToken;

    error MintingLimitExceeded();

    // the master pool token manager role is required to access the master pool token reserve
    bytes32 public constant ROLE_MASTER_POOL_TOKEN_MANAGER = keccak256("ROLE_MASTER_POOL_TOKEN_MANAGER");

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the master vault contract
    IMasterVault private immutable _masterVault;

    // the master pool token
    IPoolToken internal immutable _poolToken;

    // the total staked network token balance in the network
    uint256 internal _stakedBalance;

    // a mapping between pools and their total minted amounts
    mapping(ReserveToken => uint256) private _mintedAmounts;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 2] private __gap;

    /**
     * @dev triggered when liquidity is requested
     */
    event LiquidityRequested(
        bytes32 indexed contextId,
        ReserveToken indexed pool,
        uint256 networkTokenAmount,
        uint256 poolTokenAmount
    );

    /**
     * @dev triggered when liquidity is renounced
     */
    event LiquidityRenounced(
        bytes32 indexed contextId,
        ReserveToken indexed pool,
        uint256 networkTokenAmount,
        uint256 poolTokenAmount
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        ITokenGovernance initNetworkTokenGovernance,
        ITokenGovernance initGovTokenGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IPoolToken initMasterPoolToken
    )
        Vault(initNetworkTokenGovernance, initGovTokenGovernance)
        validAddress(address(initNetwork))
        validAddress(address(initNetworkSettings))
        validAddress(address(initMasterVault))
        validAddress(address(initMasterPoolToken))
    {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _masterVault = initMasterVault;
        _poolToken = initMasterPoolToken;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __MasterPool_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __MasterPool_init() internal onlyInitializing {
        __Vault_init();

        __MasterPool_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __MasterPool_init_unchained() internal onlyInitializing {
        _poolToken.acceptOwnership();

        // set up administrative roles
        _setRoleAdmin(ROLE_MASTER_POOL_TOKEN_MANAGER, ROLE_ADMIN);
    }

    /**
     * @inheritdoc Vault
     */
    function isPayable() public pure override(IVault, Vault) returns (bool) {
        return false;
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }

    /**
     * @dev returns whether the given caller is allowed access to the given token
     *
     * requirements:
     *
     * - reserve token must be the master pool token
     * - the caller must have the ROLE_MASTER_POOL_TOKEN_MANAGER permission
     */
    function authorizeWithdrawal(
        address caller,
        ReserveToken reserveToken,
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return reserveToken.toIERC20() == _poolToken && hasRole(ROLE_MASTER_POOL_TOKEN_MANAGER, caller);
    }

    /**
     * @inheritdoc IMasterPool
     */
    function poolToken() external view returns (IPoolToken) {
        return _poolToken;
    }

    /**
     * @inheritdoc IMasterPool
     */
    function stakedBalance() external view returns (uint256) {
        return _stakedBalance;
    }

    /**
     * @inheritdoc IMasterPool
     */
    function mintedAmount(ReserveToken pool) external view returns (uint256) {
        return _mintedAmounts[pool];
    }

    /**
     * @inheritdoc IMasterPool
     */
    function isNetworkLiquidityEnabled(ReserveToken pool, IPoolCollection poolCollection) external view returns (bool) {
        return
            ReserveToken.unwrap(pool) != address(0) &&
            address(poolCollection) != address(0) &&
            _networkSettings.isTokenWhitelisted(pool) &&
            poolCollection.isPoolRateStable(pool);
    }

    /**
     * @inheritdoc IMasterPool
     */
    function unallocatedLiquidity(ReserveToken pool) external view returns (uint256) {
        return MathEx.subMax0(_networkSettings.poolMintingLimit(pool), _mintedAmounts[pool]);
    }

    /**
     * @inheritdoc IMasterPool
     */
    function poolTokenToUnderlying(uint256 poolTokenAmount) external view returns (uint256) {
        return _poolTokenToUnderlying(poolTokenAmount);
    }

    /**
     * @inheritdoc IMasterPool
     */
    function underlyingToPoolToken(uint256 networkTokenAmount) external view returns (uint256) {
        return _underlyingToPoolToken(networkTokenAmount);
    }

    /**
     * @inheritdoc IMasterPool
     */
    function poolTokenAmountToBurn(uint256 networkTokenAmountToDistribute) external view returns (uint256) {
        if (networkTokenAmountToDistribute == 0) {
            return 0;
        }

        uint256 poolTokenSupply = _poolToken.totalSupply();
        uint256 val = networkTokenAmountToDistribute * poolTokenSupply;

        return
            MathEx.mulDivF(
                val,
                poolTokenSupply,
                val + _stakedBalance * (poolTokenSupply - _poolToken.balanceOf(address(this)))
            );
    }

    /**
     * @inheritdoc IMasterPool
     */
    function mint(address recipient, uint256 networkTokenAmount)
        external
        only(address(_network))
        validAddress(recipient)
        greaterThanZero(networkTokenAmount)
    {
        _networkTokenGovernance.mint(recipient, networkTokenAmount);
    }

    /**
     * @inheritdoc IMasterPool
     */
    function burnFromVault(uint256 networkTokenAmount)
        external
        only(address(_network))
        greaterThanZero(networkTokenAmount)
    {
        _masterVault.withdrawFunds(
            ReserveToken.wrap(address(_networkToken)),
            payable(address(this)),
            networkTokenAmount
        );

        _networkTokenGovernance.burn(networkTokenAmount);
    }

    /**
     * @inheritdoc IMasterPool
     */
    function depositFor(
        address provider,
        uint256 networkTokenAmount,
        bool isMigrating,
        uint256 originalGovTokenAmount
    )
        external
        only(address(_network))
        validAddress(provider)
        greaterThanZero(networkTokenAmount)
        returns (DepositAmounts memory)
    {
        // calculate the pool token amount to transfer
        uint256 poolTokenAmount = _underlyingToPoolToken(networkTokenAmount);

        // transfer pool tokens from the protocol to the provider. Please note that it's not possible to deposit
        // liquidity requiring the protocol to transfer the provider more protocol tokens than it holds
        _poolToken.transfer(provider, poolTokenAmount);

        // burn the previously received network tokens
        _networkTokenGovernance.burn(networkTokenAmount);

        uint256 govTokenAmount = poolTokenAmount;

        // the provider should receive pool tokens and gov tokens in equal amounts. since the provider might already
        // have some gov tokens during migration, the contract only mints the delta between the full amount and the
        // amount the provider already has
        unchecked {
            if (isMigrating) {
                govTokenAmount = MathEx.subMax0(govTokenAmount, originalGovTokenAmount);
            }
        }

        // mint governance tokens to the provider
        if (govTokenAmount > 0) {
            _govTokenGovernance.mint(provider, govTokenAmount);
        }

        return DepositAmounts({ poolTokenAmount: poolTokenAmount, govTokenAmount: govTokenAmount });
    }

    /**
     * @inheritdoc IMasterPool
     */
    function withdraw(address provider, uint256 poolTokenAmount)
        external
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
                withdrawalFeeAmount: amounts.withdrawalFeeAmount
            });
    }

    /**
     * @inheritdoc IMasterPool
     */
    function requestLiquidity(
        bytes32 contextId,
        ReserveToken pool,
        uint256 networkTokenAmount
    ) external only(address(_network)) validAddress(ReserveToken.unwrap(pool)) greaterThanZero(networkTokenAmount) {
        uint256 currentMintedAmount = _mintedAmounts[pool];
        uint256 mintingLimit = _networkSettings.poolMintingLimit(pool);
        uint256 newMintedAmount = currentMintedAmount + networkTokenAmount;

        // verify that the new minted amount doesn't exceed the limit
        if (newMintedAmount > mintingLimit) {
            revert MintingLimitExceeded();
        }

        // calculate the pool token amount to mint
        uint256 currentStakedBalance = _stakedBalance;
        uint256 poolTokenAmount;
        uint256 poolTokenTotalSupply = _poolToken.totalSupply();
        if (poolTokenTotalSupply == 0) {
            // if this is the initial liquidity provision - use a one-to-one pool token to network token rate
            if (currentStakedBalance > 0) {
                revert InvalidStakedBalance();
            }

            poolTokenAmount = networkTokenAmount;
        } else {
            poolTokenAmount = _underlyingToPoolToken(networkTokenAmount, poolTokenTotalSupply, currentStakedBalance);
        }

        // update the staked balance
        _stakedBalance = currentStakedBalance + networkTokenAmount;

        // update the current minted amount
        _mintedAmounts[pool] = newMintedAmount;

        // mint pool tokens to the protocol
        _poolToken.mint(address(this), poolTokenAmount);

        // mint network tokens to the vault
        _networkTokenGovernance.mint(address(_masterVault), networkTokenAmount);

        emit LiquidityRequested({
            contextId: contextId,
            pool: pool,
            networkTokenAmount: networkTokenAmount,
            poolTokenAmount: poolTokenAmount
        });
    }

    /**
     * @inheritdoc IMasterPool
     */
    function renounceLiquidity(
        bytes32 contextId,
        ReserveToken pool,
        uint256 networkTokenAmount
    ) external only(address(_network)) validAddress(ReserveToken.unwrap(pool)) greaterThanZero(networkTokenAmount) {
        uint256 currentStakedBalance = _stakedBalance;

        // calculate the renounced amount to deduct from both the staked balance and pool minted amount
        uint256 currentMintedAmount = _mintedAmounts[pool];
        uint256 renouncedAmount = Math.min(currentMintedAmount, networkTokenAmount);

        // calculate the pool token amount to burn
        uint256 poolTokenAmount = _underlyingToPoolToken(
            renouncedAmount,
            _poolToken.totalSupply(),
            currentStakedBalance
        );

        // update the current minted amount. Note that the given amount can be higher than the minted amount but the
        // request shouldn't fail (and the minted amount cannot get negative)
        unchecked {
            _mintedAmounts[pool] = currentMintedAmount - renouncedAmount;
        }

        // update the staked balance
        _stakedBalance = currentStakedBalance - renouncedAmount;

        // burn pool tokens from the protocol
        _poolToken.burn(poolTokenAmount);

        // withdraw network tokens from the master vault and burn them
        _masterVault.withdrawFunds(
            ReserveToken.wrap(address(_networkToken)),
            payable(address(this)),
            networkTokenAmount
        );
        _networkTokenGovernance.burn(networkTokenAmount);

        emit LiquidityRenounced({
            contextId: contextId,
            pool: pool,
            networkTokenAmount: networkTokenAmount,
            poolTokenAmount: poolTokenAmount
        });
    }

    /**
     * @inheritdoc IMasterPool
     */
    function onFeesCollected(
        ReserveToken pool,
        uint256 feeAmount,
        uint8 feeType
    ) external only(address(_network)) validAddress(ReserveToken.unwrap(pool)) {
        if (feeAmount == 0) {
            return;
        }

        // increase the staked balance by the given amount
        _stakedBalance += feeAmount;

        if (feeType == TRADING_FEE) {
            // increase the minted amount for the specified pool by the given amount
            _mintedAmounts[pool] += feeAmount;
        }
    }

    /**
     * @dev converts the specified pool token amount to the underlying network token amount
     */
    function _poolTokenToUnderlying(uint256 poolTokenAmount) private view returns (uint256) {
        return MathEx.mulDivF(poolTokenAmount, _stakedBalance, _poolToken.totalSupply());
    }

    /**
     * @dev converts the specified underlying network token amount to pool token amount
     */
    function _underlyingToPoolToken(uint256 networkTokenAmount) private view returns (uint256) {
        return _underlyingToPoolToken(networkTokenAmount, _poolToken.totalSupply(), _stakedBalance);
    }

    /**
     * @dev converts the specified underlying network token amount to pool token amount
     */
    function _underlyingToPoolToken(
        uint256 networkTokenAmount,
        uint256 poolTokenTotalSupply,
        uint256 currentStakedBalance
    ) private pure returns (uint256) {
        return MathEx.mulDivF(networkTokenAmount, poolTokenTotalSupply, currentStakedBalance);
    }

    /**
     * @dev returns withdrawal amounts
     */
    function _withdrawalAmounts(uint256 poolTokenAmount) internal view returns (WithdrawalAmounts memory) {
        // calculate the network token amount to transfer
        uint256 networkTokenAmount = _poolTokenToUnderlying(poolTokenAmount);

        // deduct the exit fee from the network token amount
        uint256 withdrawalFeeAmount = MathEx.mulDivF(
            networkTokenAmount,
            _networkSettings.withdrawalFeePPM(),
            PPM_RESOLUTION
        );
        unchecked {
            networkTokenAmount -= withdrawalFeeAmount;
        }

        return
            WithdrawalAmounts({
                networkTokenAmount: networkTokenAmount,
                poolTokenAmount: poolTokenAmount,
                govTokenAmount: poolTokenAmount,
                withdrawalFeeAmount: withdrawalFeeAmount
            });
    }
}
