// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Address } from "@openzeppelin/contracts/utils/Address.sol";

import { IUniswapV2Pair } from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol";
import { IUniswapV2Factory } from "@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol";
import { IUniswapV2Router02 } from "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";
import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";

import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";

import { IBancorPortal, PositionMigration } from "./interfaces/IBancorPortal.sol";

struct MigrationResult {
    IUniswapV2Pair pair;
    Token tokenA;
    Token tokenB;
    bool depositedA;
    bool depositedB;
    uint256 amountA;
    uint256 amountB;
}

/**
 * @dev one click liquidity migration between other DEXes into Bancor v3
 */
contract BancorPortal is IBancorPortal, ReentrancyGuardUpgradeable, Utils, Upgradeable {
    using SafeERC20 for IERC20;
    using SafeERC20 for IPoolToken;
    using TokenLibrary for Token;
    using Address for address payable;

    uint32 private constant MAX_DEADLINE = 10800;

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the bnt contract
    IERC20 private immutable _bnt;

    // Uniswap v2 router contract
    IUniswapV2Router02 private immutable _uniswapV2Router;

    // Uniswap v2 factory contract
    IUniswapV2Factory private immutable _uniswapV2Factory;

    // SushiSwap router contract
    IUniswapV2Router02 private immutable _sushiSwapRouter;

    // SushiSwap factory contract
    IUniswapV2Factory private immutable _sushiSwapFactory;

    // WETH9 contract
    IERC20 private immutable _weth;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    /**
     * @dev triggered after a successful Uniswap V2 migration
     */
    event UniswapV2PositionMigrated(
        address indexed provider,
        IUniswapV2Pair poolToken,
        Token indexed tokenA,
        Token indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        bool depositedA,
        bool depositedB
    );

    /**
     * @dev triggered after a successful SushiSwap V1 migration
     */
    event SushiSwapPositionMigrated(
        address indexed provider,
        IUniswapV2Pair poolToken,
        Token indexed tokenA,
        Token indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        bool depositedA,
        bool depositedB
    );

    error UnsupportedTokens();
    error NoPairForTokens();

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initBnt,
        IUniswapV2Router02 initUniswapV2Router,
        IUniswapV2Factory initUniswapV2Factory,
        IUniswapV2Router02 initSushiSwapRouter,
        IUniswapV2Factory initSushiSwapFactory
    )
        validAddress(address(initNetwork))
        validAddress(address(initNetworkSettings))
        validAddress(address(initBnt))
        validAddress(address(initUniswapV2Router))
        validAddress(address(initUniswapV2Factory))
        validAddress(address(initSushiSwapRouter))
        validAddress(address(initSushiSwapFactory))
    {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _bnt = initBnt;
        _uniswapV2Router = initUniswapV2Router;
        _uniswapV2Factory = initUniswapV2Factory;
        _sushiSwapRouter = initSushiSwapRouter;
        _sushiSwapFactory = initSushiSwapFactory;
        _weth = IERC20(initUniswapV2Router.WETH());
    }

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 3;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __BancorPortal_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __BancorPortal_init() internal onlyInitializing {
        __ReentrancyGuard_init();
        __Upgradeable_init();

        __BancorPortal_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __BancorPortal_init_unchained() internal onlyInitializing {}

    /**
     * @dev authorize the contract to receive the native token
     */
    receive() external payable {}

    /**
     * @inheritdoc IBancorPortal
     */
    function migrateUniswapV2Position(
        Token token0,
        Token token1,
        uint256 poolTokenAmount
    )
        external
        nonReentrant
        validAddress(address(token0))
        validAddress(address(token1))
        greaterThanZero(poolTokenAmount)
        returns (PositionMigration memory)
    {
        MigrationResult memory res = _migrateUniswapV2Position(
            _uniswapV2Router,
            _uniswapV2Factory,
            token0,
            token1,
            poolTokenAmount,
            msg.sender
        );

        emit UniswapV2PositionMigrated({
            provider: msg.sender,
            poolToken: res.pair,
            tokenA: res.tokenA,
            tokenB: res.tokenB,
            amountA: res.amountA,
            amountB: res.amountB,
            depositedA: res.depositedA,
            depositedB: res.depositedB
        });

        return PositionMigration({ amountA: res.amountA, amountB: res.amountB });
    }

    /**
     * @inheritdoc IBancorPortal
     */
    function migrateSushiSwapPosition(
        Token token0,
        Token token1,
        uint256 poolTokenAmount
    )
        external
        nonReentrant
        validAddress(address(token0))
        validAddress(address(token1))
        greaterThanZero(poolTokenAmount)
        returns (PositionMigration memory)
    {
        MigrationResult memory res = _migrateUniswapV2Position(
            _sushiSwapRouter,
            _sushiSwapFactory,
            token0,
            token1,
            poolTokenAmount,
            msg.sender
        );

        emit SushiSwapPositionMigrated({
            provider: msg.sender,
            poolToken: res.pair,
            tokenA: res.tokenA,
            tokenB: res.tokenB,
            amountA: res.amountA,
            amountB: res.amountB,
            depositedA: res.depositedA,
            depositedB: res.depositedB
        });

        return PositionMigration({ amountA: res.amountA, amountB: res.amountB });
    }

    /**
     * @dev migrates funds from a Uniswap v2/SushiSwap  pair into a bancor v3 pool and returns the deposited amount for
     * each token in the same order as stored in Uniswap's pair, or 0 for unsupported tokens (unsupported tokens will be
     * transferred to the caller)
     *
     * requirements:
     *
     * - the caller must have approved the pair to transfer the liquidity on its behalf
     */
    function _migrateUniswapV2Position(
        IUniswapV2Router02 router,
        IUniswapV2Factory factory,
        Token token0,
        Token token1,
        uint256 poolTokenAmount,
        address provider
    ) private returns (MigrationResult memory) {
        // arrange tokens in an array, replace WETH with the native token
        Token[2] memory tokens = [
            _isWETH(token0) ? TokenLibrary.NATIVE_TOKEN : token0,
            _isWETH(token1) ? TokenLibrary.NATIVE_TOKEN : token1
        ];

        // get Uniswap's pair
        IUniswapV2Pair pair = _getUniswapV2Pair(factory, tokens);
        if (address(pair) == address(0)) {
            revert NoPairForTokens();
        }

        // transfer the tokens from the caller
        Token(address(pair)).safeTransferFrom(provider, address(this), poolTokenAmount);

        // look for relevant whitelisted pools, revert if there are none
        bool[2] memory whitelist;
        for (uint256 i = 0; i < 2; i++) {
            Token token = tokens[i];
            whitelist[i] = token.isEqual(_bnt) || _networkSettings.isTokenWhitelisted(token);
        }
        if (!whitelist[0] && !whitelist[1]) {
            revert UnsupportedTokens();
        }

        // save states
        uint256[2] memory previousBalances = [tokens[0].balanceOf(address(this)), tokens[1].balanceOf(address(this))];

        // remove liquidity from Uniswap
        _uniV2RemoveLiquidity(tokens, pair, router, poolTokenAmount);

        // migrate funds
        uint256[2] memory deposited;
        for (uint256 i = 0; i < 2; i++) {
            Token token = tokens[i];
            uint256 delta = token.balanceOf(address(this)) - previousBalances[i];
            if (whitelist[i]) {
                deposited[i] = delta;

                _deposit(token, deposited[i], provider);
            } else {
                _transferToProvider(token, delta, provider);
            }
        }

        return
            MigrationResult({
                pair: pair,
                tokenA: tokens[0],
                tokenB: tokens[1],
                depositedA: whitelist[0],
                depositedB: whitelist[1],
                amountA: deposited[0],
                amountB: deposited[1]
            });
    }

    /**
     * @dev deposits given amount into a pool of given token
     */
    function _deposit(Token token, uint256 amount, address provider) private {
        if (token.isNative()) {
            _network.depositFor{ value: amount }(provider, token, amount);
        } else {
            token.toIERC20().safeApprove(address(_network), amount);

            _network.depositFor(provider, token, amount);
        }
    }

    /**
     * @dev transfer given amount of given token to the caller
     */
    function _transferToProvider(Token token, uint256 amount, address provider) private {
        if (token.isNative()) {
            payable(provider).sendValue(amount);
        } else {
            token.toIERC20().safeTransfer(provider, amount);
        }
    }

    /**
     * @dev removes liquidity from Uniswap's pair, transfer funds to self
     */
    function _uniV2RemoveLiquidity(
        Token[2] memory tokens,
        IUniswapV2Pair pair,
        IUniswapV2Router02 router,
        uint256 poolTokenAmount
    ) private {
        IERC20(address(pair)).safeApprove(address(router), poolTokenAmount);
        uint256 deadline = block.timestamp + MAX_DEADLINE;

        if (tokens[0].isNative()) {
            router.removeLiquidityETH(address(tokens[1]), poolTokenAmount, 1, 1, address(this), deadline);
        } else if (tokens[1].isNative()) {
            router.removeLiquidityETH(address(tokens[0]), poolTokenAmount, 1, 1, address(this), deadline);
        } else {
            router.removeLiquidity(
                address(tokens[0]),
                address(tokens[1]),
                poolTokenAmount,
                1,
                1,
                address(this),
                deadline
            );
        }
    }

    /**
     * @dev fetches a UniswapV2 pair
     */
    function _getUniswapV2Pair(
        IUniswapV2Factory factory,
        Token[2] memory tokens
    ) private view returns (IUniswapV2Pair) {
        // Uniswap does not support ETH input, transform to WETH if necessary
        address token0Address = tokens[0].isNative() ? address(_weth) : address(tokens[0]);
        address token1Address = tokens[1].isNative() ? address(_weth) : address(tokens[1]);

        address pairAddress = factory.getPair(token0Address, token1Address);
        return IUniswapV2Pair(pairAddress);
    }

    /**
     * @dev returns true if given token is WETH
     */
    function _isWETH(Token token) private view returns (bool) {
        return address(token) == address(_weth);
    }
}
