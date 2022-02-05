// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";
import { IBancorNetwork } from "../network/interfaces/IBancorNetwork.sol";
import { IPoolToken } from "../pools/interfaces/IPoolToken.sol";
import { IV3Migratror } from "./interfaces/IV3Migratror.sol";
import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";
import { IUniswapV2Pair } from "./interfaces/IUniswapV2Pair.sol";
import { IUniswapV2Router02 } from "./interfaces/IUniswapV2Router02.sol";
import { INetworkSettings } from "../network/interfaces/INetworkSettings.sol";
import { NetworkSettings } from "../network/NetworkSettings.sol";
import "hardhat/console.sol";

/**
 * @dev One click liquidity migrations between other dexes into bancor v3
 */
contract V3Migrator is IV3Migratror, ReentrancyGuardUpgradeable, Utils, Upgradeable {
    using SafeERC20 for IERC20;
    using SafeERC20 for IPoolToken;
    using TokenLibrary for Token;

    // the network contract
    IBancorNetwork private immutable _network;

    // the network contract
    INetworkSettings private immutable _networkSettings;

    // the address of the network token
    IERC20 private immutable _networkToken;

    // uniswap v2 router
    IUniswapV2Router02 private immutable _uniswapV2Router;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 3] private __gap;

    error NotWhiteListed();

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork network,
        INetworkSettings networkSettings,
        IUniswapV2Router02 uniswapV2Router,
        IERC20 networkToken
    )
        validAddress(address(network))
        validAddress(address(networkSettings))
        validAddress(address(uniswapV2Router))
        validAddress(address(networkToken))
    {
        _network = network;
        _networkSettings = networkSettings;
        _uniswapV2Router = uniswapV2Router;
        _networkToken = networkToken;
    }

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __V3Migrator_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __V3Migrator_init() internal initializer {
        __ReentrancyGuard_init();
        __Upgradeable_init();

        __V3Migrator_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __V3Migrator_init_unchained() internal initializer {}

    /**
     * @dev ETH receive callback
     */
    receive() external payable {}

    /**
     * @dev returns the program data of a pool
     */
    function migrateUniswapV2Position(IUniswapV2Pair pair, uint256 amount)
        external
        nonReentrant
        validAddress(address(pair))
    {
        _migrateUniswapV2Position(_uniswapV2Router, pair, amount);
    }

    function _migrateUniswapV2Position(
        IUniswapV2Router02 router,
        IUniswapV2Pair pair,
        uint256 amount
    ) internal returns (uint256 a, uint256 b) {
        // approve the migration
        Token(address(pair)).safeTransferFrom(msg.sender, address(this), amount);

        // get the pair's tokens
        Token[] memory tokens = new Token[](2);
        tokens[0] = Token(address(pair.token0()));
        tokens[1] = Token(address(pair.token1()));

        // look for relevant whitelisted pools, revert if there are none
        bool[] memory whitelist = new bool[](2);
        whitelist[0] = _networkSettings.isTokenWhitelisted(tokens[0]);
        whitelist[1] = _networkSettings.isTokenWhitelisted(tokens[1]);
        if (!whitelist[0] && !whitelist[1]) {
            revert NotWhiteListed();
        }

        // save state
        uint256[] memory previousBalances = new uint256[](2);
        previousBalances[0] = tokens[0].balanceOf(address(pair));
        previousBalances[1] = tokens[1].balanceOf(address(pair));

        // remove liquidity from uniswap
        _uniV2RemoveLiquidity(tokens[0], tokens[1], pair, router, amount);

        // save new state
        uint256[] memory newBalances = new uint256[](2);
        newBalances[0] = tokens[0].balanceOf(address(pair));
        newBalances[1] = tokens[1].balanceOf(address(pair));

        // transfer funds
        uint256[] memory deposited = new uint256[](2);
        for (uint8 i = 0; i < 2; i++) {
            uint256 delta = previousBalances[i] - newBalances[i];
            if (whitelist[i]) {
                deposited[i] = delta;
                _deposit(tokens[i], deposited[i]);
            } else {
                deposited[i] = 0;
                _transferToWallet(tokens[i], delta);
            }
        }
        return (deposited[0], deposited[1]);
    }

    function _deposit(Token token, uint256 amount) private {
        if (token.isNative()) {
            _network.depositFor{ value: amount }(msg.sender, token, amount);
        } else {
            token.toIERC20().safeApprove(address(_network), amount);
            _network.depositFor(msg.sender, token, amount);
        }
    }

    function _transferToWallet(Token token, uint256 amount) private {
        if (token.isNative()) {
            payable(msg.sender).transfer(amount);
        } else {
            token.toIERC20().safeTransfer(msg.sender, amount);
        }
    }

    function _uniV2RemoveLiquidity(
        Token token0,
        Token token1,
        IUniswapV2Pair pair,
        IUniswapV2Router02 router,
        uint256 amount
    ) private {
        IERC20(address(pair)).safeApprove(address(router), amount);

        uint256 deadline = block.timestamp + 10800;
        if (token0.isNative()) {
            router.removeLiquidityETH(address(token1), amount, 1, 1, address(this), deadline);
        } else if (token1.isNative()) {
            router.removeLiquidityETH(address(token0), amount, 1, 1, address(this), deadline);
        } else {
            router.removeLiquidity(address(token0), address(token1), amount, 1, 1, address(this), deadline);
        }
    }

    /**
     * @dev returns whether the specified token is the network token
     */
    function _isNetworkToken(Token token) private view returns (bool) {
        return token.isEqual(_networkToken);
    }

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure returns (uint16) {
        return 1;
    }
}
