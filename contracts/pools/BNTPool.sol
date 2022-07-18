// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { InvalidParam, InvalidStakedBalance } from "../utility/Utils.sol";
import { PPM_RESOLUTION } from "../utility/Constants.sol";
import { MathEx } from "../utility/MathEx.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings, NotWhitelisted } from "../network/interfaces/INetworkSettings.sol";

import { IMasterVault } from "../vaults/interfaces/IMasterVault.sol";

// prettier-ignore
import {
    IBNTPool,
    ROLE_BNT_POOL_TOKEN_MANAGER,
    ROLE_BNT_MANAGER,
    ROLE_VAULT_MANAGER,
    ROLE_FUNDING_MANAGER
} from "./interfaces/IBNTPool.sol";

import { IPoolToken } from "./interfaces/IPoolToken.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { Vault } from "../vaults/Vault.sol";
import { IVault } from "../vaults/interfaces/IVault.sol";

/**
 * @dev BNT Pool contract
 */
contract BNTPool is IBNTPool, Vault {
    using TokenLibrary for Token;

    error FundingLimitExceeded();

    struct InternalWithdrawalAmounts {
        uint256 bntAmount;
        uint256 withdrawalFeeAmount;
    }

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the master vault contract
    IMasterVault private immutable _masterVault;

    // the BNT pool token
    IPoolToken internal immutable _poolToken;

    // the total staked BNT balance in the network
    uint256 private _stakedBalance;

    // a mapping between pools and their current funding
    mapping(Token => uint256) private _currentPoolFunding;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 2] private __gap;

    /**
     * @dev triggered when liquidity is deposited
     */
    event TokensDeposited(
        bytes32 indexed contextId,
        address indexed provider,
        uint256 bntAmount,
        uint256 poolTokenAmount,
        uint256 vbntAmount
    );

    /**
     * @dev triggered when liquidity is withdrawn
     */
    event TokensWithdrawn(
        bytes32 indexed contextId,
        address indexed provider,
        uint256 bntAmount,
        uint256 poolTokenAmount,
        uint256 vbntAmount,
        uint256 withdrawalFeeAmount
    );

    /**
     * @dev triggered when funding is requested
     */
    event FundingRequested(bytes32 indexed contextId, Token indexed pool, uint256 bntAmount, uint256 poolTokenAmount);

    /**
     * @dev triggered when funding is renounced
     */
    event FundingRenounced(bytes32 indexed contextId, Token indexed pool, uint256 bntAmount, uint256 poolTokenAmount);

    /**
     * @dev triggered when the total liquidity in the BNT pool is updated
     */
    event TotalLiquidityUpdated(
        bytes32 indexed contextId,
        uint256 liquidity,
        uint256 stakedBalance,
        uint256 poolTokenSupply
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        ITokenGovernance initBNTGovernance,
        ITokenGovernance initVBNTGovernance,
        INetworkSettings initNetworkSettings,
        IMasterVault initMasterVault,
        IPoolToken initBNTPoolToken
    )
        Vault(initBNTGovernance, initVBNTGovernance)
        validAddress(address(initNetwork))
        validAddress(address(initNetworkSettings))
        validAddress(address(initMasterVault))
        validAddress(address(initBNTPoolToken))
    {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _masterVault = initMasterVault;
        _poolToken = initBNTPoolToken;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __BNTPool_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BNTPool_init() internal onlyInitializing {
        __Vault_init();

        __BNTPool_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BNTPool_init_unchained() internal onlyInitializing {
        _poolToken.acceptOwnership();

        // set up administrative roles
        _setRoleAdmin(ROLE_BNT_POOL_TOKEN_MANAGER, ROLE_ADMIN);
        _setRoleAdmin(ROLE_BNT_MANAGER, ROLE_ADMIN);
        _setRoleAdmin(ROLE_VAULT_MANAGER, ROLE_ADMIN);
        _setRoleAdmin(ROLE_FUNDING_MANAGER, ROLE_ADMIN);
    }

    // solhint-enable func-name-mixedcase

    modifier poolWhitelisted(Token pool) {
        _poolWhitelisted(pool);

        _;
    }

    /**
     * @dev validates that the provided pool is whitelisted
     */
    function _poolWhitelisted(Token pool) internal view {
        if (!_networkSettings.isTokenWhitelisted(pool)) {
            revert NotWhitelisted();
        }
    }

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 3;
    }

    /**
     * @inheritdoc Vault
     */
    function isPayable() public pure override(IVault, Vault) returns (bool) {
        return false;
    }

    /**
     * @dev returns the BNT pool token manager role
     */
    function roleBNTPoolTokenManager() external pure returns (bytes32) {
        return ROLE_BNT_POOL_TOKEN_MANAGER;
    }

    /**
     * @dev returns the BNT manager role
     */
    function roleBNTManager() external pure returns (bytes32) {
        return ROLE_BNT_MANAGER;
    }

    /**
     * @dev returns the vault manager role
     */
    function roleVaultManager() external pure returns (bytes32) {
        return ROLE_VAULT_MANAGER;
    }

    /**
     * @dev returns the funding manager role
     */
    function roleFundingManager() external pure returns (bytes32) {
        return ROLE_FUNDING_MANAGER;
    }

    /**
     * @dev returns whether the given caller is allowed access to the given token
     *
     * requirements:
     *
     * - the token must be the BNT pool token
     * - the caller must have the ROLE_BNT_POOL_TOKEN_MANAGER role
     */
    function isAuthorizedWithdrawal(
        address caller,
        Token token,
        address, /* target */
        uint256 /* amount */
    ) internal view override returns (bool) {
        return token.isEqual(_poolToken) && hasRole(ROLE_BNT_POOL_TOKEN_MANAGER, caller);
    }

    /**
     * @inheritdoc IBNTPool
     */
    function poolToken() external view returns (IPoolToken) {
        return _poolToken;
    }

    /**
     * @inheritdoc IBNTPool
     */
    function stakedBalance() external view returns (uint256) {
        return _stakedBalance;
    }

    /**
     * @inheritdoc IBNTPool
     */
    function currentPoolFunding(Token pool) external view returns (uint256) {
        return _currentPoolFunding[pool];
    }

    /**
     * @inheritdoc IBNTPool
     */
    function availableFunding(Token pool) external view returns (uint256) {
        return MathEx.subMax0(_networkSettings.poolFundingLimit(pool), _currentPoolFunding[pool]);
    }

    /**
     * @inheritdoc IBNTPool
     */
    function poolTokenToUnderlying(uint256 poolTokenAmount) external view returns (uint256) {
        return _poolTokenToUnderlying(poolTokenAmount);
    }

    /**
     * @inheritdoc IBNTPool
     */
    function underlyingToPoolToken(uint256 bntAmount) external view returns (uint256) {
        return _underlyingToPoolToken(bntAmount);
    }

    /**
     * @inheritdoc IBNTPool
     */
    function poolTokenAmountToBurn(uint256 bntAmountToDistribute) external view returns (uint256) {
        if (bntAmountToDistribute == 0) {
            return 0;
        }

        uint256 poolTokenSupply = _poolToken.totalSupply();
        uint256 val = bntAmountToDistribute * poolTokenSupply;

        return
            MathEx.mulDivF(
                val,
                poolTokenSupply,
                val + _stakedBalance * (poolTokenSupply - _poolToken.balanceOf(address(this)))
            );
    }

    /**
     * @inheritdoc IBNTPool
     */
    function mint(address recipient, uint256 bntAmount)
        external
        onlyRoleMember(ROLE_BNT_MANAGER)
        validAddress(recipient)
        greaterThanZero(bntAmount)
    {
        _bntGovernance.mint(recipient, bntAmount);
    }

    /**
     * @inheritdoc IBNTPool
     */
    function burnFromVault(uint256 bntAmount) external onlyRoleMember(ROLE_VAULT_MANAGER) greaterThanZero(bntAmount) {
        _masterVault.burn(Token(address(_bnt)), bntAmount);
    }

    /**
     * @inheritdoc IBNTPool
     */
    function depositFor(
        bytes32 contextId,
        address provider,
        uint256 bntAmount,
        bool isMigrating,
        uint256 originalVBNTAmount
    ) external only(address(_network)) validAddress(provider) greaterThanZero(bntAmount) returns (uint256) {
        // calculate the required pool token amount
        uint256 currentStakedBalance = _stakedBalance;
        uint256 poolTokenTotalSupply = _poolToken.totalSupply();
        if (poolTokenTotalSupply == 0 && currentStakedBalance > 0) {
            revert InvalidStakedBalance();
        }

        uint256 poolTokenAmount = _underlyingToPoolToken(bntAmount, poolTokenTotalSupply, currentStakedBalance);

        // if the protocol doesn't have enough pool tokens, mint new ones
        uint256 poolTokenBalance = _poolToken.balanceOf(address(this));
        if (poolTokenAmount > poolTokenBalance) {
            uint256 newPoolTokenAmount = poolTokenAmount - poolTokenBalance;
            uint256 increaseStakedBalanceAmount = _poolTokenToUnderlying(
                newPoolTokenAmount,
                currentStakedBalance,
                poolTokenTotalSupply
            );

            // update the staked balance
            _stakedBalance = currentStakedBalance + increaseStakedBalanceAmount;

            // mint pool tokens to the protocol
            _poolToken.mint(address(this), newPoolTokenAmount);
        }

        // transfer pool tokens from the protocol to the provider
        _poolToken.transfer(provider, poolTokenAmount);

        // burn the previously received BNT
        _bntGovernance.burn(bntAmount);

        uint256 vbntAmount = poolTokenAmount;

        // the provider should receive pool tokens and vBNT in equal amounts. since the provider might already have
        // some vBNT during migration, the contract only mints the delta between the full amount and the amount the
        // provider already has
        if (isMigrating) {
            vbntAmount = MathEx.subMax0(vbntAmount, originalVBNTAmount);
        }

        // mint vBNT to the provider
        if (vbntAmount > 0) {
            _vbntGovernance.mint(provider, vbntAmount);
        }

        emit TokensDeposited({
            contextId: contextId,
            provider: provider,
            bntAmount: bntAmount,
            poolTokenAmount: poolTokenAmount,
            vbntAmount: vbntAmount
        });

        return poolTokenAmount;
    }

    /**
     * @inheritdoc IBNTPool
     */
    function withdraw(
        bytes32 contextId,
        address provider,
        uint256 poolTokenAmount,
        uint256 bntAmount
    )
        external
        only(address(_network))
        validAddress(provider)
        greaterThanZero(poolTokenAmount)
        greaterThanZero(bntAmount)
        returns (uint256)
    {
        // ensure that the provided amounts correspond to the state of the pool. Note the pool tokens should
        // have been already deposited back from the network
        uint256 underlyingAmount = _poolTokenToUnderlying(poolTokenAmount);
        if (bntAmount > underlyingAmount) {
            revert InvalidParam();
        }

        InternalWithdrawalAmounts memory amounts = _withdrawalAmounts(bntAmount);

        // burn the respective vBNT amount
        _vbntGovernance.burn(poolTokenAmount);

        // mint BNT to the provider
        _bntGovernance.mint(provider, amounts.bntAmount);

        emit TokensWithdrawn({
            contextId: contextId,
            provider: provider,
            bntAmount: amounts.bntAmount,
            poolTokenAmount: poolTokenAmount,
            vbntAmount: poolTokenAmount,
            withdrawalFeeAmount: amounts.withdrawalFeeAmount
        });

        return amounts.bntAmount;
    }

    /**
     * @inheritdoc IBNTPool
     */
    function withdrawalAmount(uint256 poolTokenAmount)
        external
        view
        greaterThanZero(poolTokenAmount)
        returns (uint256)
    {
        return _withdrawalAmounts(_poolTokenToUnderlying(poolTokenAmount)).bntAmount;
    }

    /**
     * @inheritdoc IBNTPool
     */
    function requestFunding(
        bytes32 contextId,
        Token pool,
        uint256 bntAmount
    ) external onlyRoleMember(ROLE_FUNDING_MANAGER) poolWhitelisted(pool) greaterThanZero(bntAmount) {
        uint256 currentFunding = _currentPoolFunding[pool];
        uint256 fundingLimit = _networkSettings.poolFundingLimit(pool);
        uint256 newFunding = currentFunding + bntAmount;

        // verify that the new funding amount doesn't exceed the limit
        if (newFunding > fundingLimit) {
            revert FundingLimitExceeded();
        }

        // calculate the pool token amount to mint
        uint256 currentStakedBalance = _stakedBalance;
        uint256 poolTokenAmount;
        uint256 poolTokenTotalSupply = _poolToken.totalSupply();
        if (poolTokenTotalSupply == 0 && currentStakedBalance > 0) {
            revert InvalidStakedBalance();
        }

        poolTokenAmount = _underlyingToPoolToken(bntAmount, poolTokenTotalSupply, currentStakedBalance);

        // update the staked balance
        uint256 newStakedBalance = currentStakedBalance + bntAmount;
        _stakedBalance = newStakedBalance;

        // update the current funding amount
        _currentPoolFunding[pool] = newFunding;

        // mint pool tokens to the protocol
        _poolToken.mint(address(this), poolTokenAmount);

        // mint BNT to the vault
        _bntGovernance.mint(address(_masterVault), bntAmount);

        emit FundingRequested({
            contextId: contextId,
            pool: pool,
            bntAmount: bntAmount,
            poolTokenAmount: poolTokenAmount
        });

        emit TotalLiquidityUpdated({
            contextId: contextId,
            liquidity: _bnt.balanceOf(address(_masterVault)),
            stakedBalance: newStakedBalance,
            poolTokenSupply: poolTokenTotalSupply + poolTokenAmount
        });
    }

    /**
     * @inheritdoc IBNTPool
     */
    function renounceFunding(
        bytes32 contextId,
        Token pool,
        uint256 bntAmount
    ) external onlyRoleMember(ROLE_FUNDING_MANAGER) poolWhitelisted(pool) greaterThanZero(bntAmount) {
        uint256 currentStakedBalance = _stakedBalance;

        // calculate the final amount to deduct from the current pool funding
        uint256 currentFunding = _currentPoolFunding[pool];
        uint256 reduceFundingAmount = Math.min(currentFunding, bntAmount);

        // calculate the amount of pool tokens to burn
        // note that the given amount can exceed the total available but the request shouldn't fail
        uint256 poolTokenTotalSupply = _poolToken.totalSupply();
        uint256 poolTokenAmount = _underlyingToPoolToken(
            reduceFundingAmount,
            poolTokenTotalSupply,
            currentStakedBalance
        );

        // ensure the amount of pool tokens doesn't exceed the total available
        poolTokenAmount = Math.min(poolTokenAmount, _poolToken.balanceOf(address(this)));

        // calculate the final amount to deduct from the staked balance
        uint256 reduceStakedBalanceAmount = _poolTokenToUnderlying(
            poolTokenAmount,
            currentStakedBalance,
            poolTokenTotalSupply
        );

        // update the current pool funding. Note that the given amount can exceed the funding amount but the
        // request shouldn't fail (and the funding amount cannot get negative)
        _currentPoolFunding[pool] = currentFunding - reduceFundingAmount;

        // update the staked balance
        uint256 newStakedBalance = currentStakedBalance - reduceStakedBalanceAmount;
        _stakedBalance = newStakedBalance;

        // burn pool tokens from the protocol
        _poolToken.burn(poolTokenAmount);

        // burn all BNT from the master vault
        _masterVault.burn(Token(address(_bnt)), bntAmount);

        emit FundingRenounced({
            contextId: contextId,
            pool: pool,
            bntAmount: bntAmount,
            poolTokenAmount: poolTokenAmount
        });

        emit TotalLiquidityUpdated({
            contextId: contextId,
            liquidity: _bnt.balanceOf(address(_masterVault)),
            stakedBalance: newStakedBalance,
            poolTokenSupply: poolTokenTotalSupply - poolTokenAmount
        });
    }

    /**
     * @inheritdoc IBNTPool
     */
    function onFeesCollected(
        Token pool,
        uint256 feeAmount,
        bool isTradeFee
    ) external only(address(_network)) validAddress(address(pool)) {
        if (feeAmount == 0) {
            return;
        }

        // increase the staked balance by the given amount
        _stakedBalance += feeAmount;

        if (isTradeFee) {
            // increase the current funding for the specified pool by the given amount
            _currentPoolFunding[pool] += feeAmount;
        }
    }

    /**
     * @dev converts the specified pool token amount to the underlying BNT amount
     */
    function _poolTokenToUnderlying(uint256 poolTokenAmount) private view returns (uint256) {
        return _poolTokenToUnderlying(poolTokenAmount, _stakedBalance, _poolToken.totalSupply());
    }

    /**
     * @dev converts the specified pool token amount to the underlying BNT amount
     */
    function _poolTokenToUnderlying(
        uint256 poolTokenAmount,
        uint256 currentStakedBalance,
        uint256 poolTokenTotalSupply
    ) private pure returns (uint256) {
        // if no pool token supply exists yet, use a one-to-one pool token to BNT rate
        if (poolTokenTotalSupply == 0) {
            return poolTokenAmount;
        }

        return MathEx.mulDivF(poolTokenAmount, currentStakedBalance, poolTokenTotalSupply);
    }

    /**
     * @dev converts the specified underlying BNT amount to pool token amount
     */
    function _underlyingToPoolToken(uint256 bntAmount) private view returns (uint256) {
        return _underlyingToPoolToken(bntAmount, _poolToken.totalSupply(), _stakedBalance);
    }

    /**
     * @dev converts the specified underlying BNT amount to pool token amount
     */
    function _underlyingToPoolToken(
        uint256 bntAmount,
        uint256 poolTokenTotalSupply,
        uint256 currentStakedBalance
    ) private pure returns (uint256) {
        // if no pool token supply exists yet, use a one-to-one pool token to BNT rate
        if (poolTokenTotalSupply == 0) {
            return bntAmount;
        }

        return MathEx.mulDivC(bntAmount, poolTokenTotalSupply, currentStakedBalance);
    }

    /**
     * @dev returns withdrawal amounts
     */
    function _withdrawalAmounts(uint256 bntAmount) internal view returns (InternalWithdrawalAmounts memory) {
        // deduct the exit fee from BNT amount
        uint256 withdrawalFeeAmount = MathEx.mulDivF(bntAmount, _networkSettings.withdrawalFeePPM(), PPM_RESOLUTION);

        bntAmount -= withdrawalFeeAmount;

        return InternalWithdrawalAmounts({ bntAmount: bntAmount, withdrawalFeeAmount: withdrawalFeeAmount });
    }
}
