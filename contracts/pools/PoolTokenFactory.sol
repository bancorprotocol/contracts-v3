// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";

import { IPoolTokenFactory } from "./interfaces/IPoolTokenFactory.sol";
import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { PoolToken } from "./PoolToken.sol";

/**
 * @dev Pool Token Factory contract
 */
contract PoolTokenFactory is IPoolTokenFactory, Upgradeable, Utils {
    using TokenLibrary for Token;

    string private constant POOL_TOKEN_SYMBOL_PREFIX = "bn";
    string private constant POOL_TOKEN_NAME_PREFIX = "Bancor";
    string private constant POOL_TOKEN_NAME_SUFFIX = "Pool Token";

    // a mapping between tokens and custom symbol overrides (only needed for tokens with malformed symbol property)
    mapping(Token => string) private _tokenSymbolOverrides;

    // a mapping between tokens and custom token overrides (only needed for tokens with malformed decimals property)
    mapping(Token => uint8) private _tokenDecimalsOverrides;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 2] private __gap;

    /**
     * @dev triggered when a pool token is created
     */
    event PoolTokenCreated(IPoolToken indexed poolToken, Token indexed token);

    /**
     * @dev fully initializes the contract and its parents
     */
    function initialize() external initializer {
        __PoolTokenFactory_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __PoolTokenFactory_init() internal onlyInitializing {
        __Upgradeable_init();

        __PoolTokenFactory_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __PoolTokenFactory_init_unchained() internal onlyInitializing {}

    // solhint-enable func-name-mixedcase

    /**
     * @inheritdoc Upgradeable
     */
    function version() public pure override(IVersioned, Upgradeable) returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPoolTokenFactory
     */
    function tokenSymbolOverride(Token token) external view returns (string memory) {
        return _tokenSymbolOverrides[token];
    }

    /**
     * @dev sets the custom symbol override for a given reserve token
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setTokenSymbolOverride(Token token, string calldata symbol) external onlyAdmin {
        _tokenSymbolOverrides[token] = symbol;
    }

    /**
     * @inheritdoc IPoolTokenFactory
     */
    function tokenDecimalsOverride(Token token) external view returns (uint8) {
        return _tokenDecimalsOverrides[token];
    }

    /**
     * @dev sets the decimals override for a given reserve token
     *
     * requirements:
     *
     * - the caller must be the admin of the contract
     */
    function setTokenDecimalsOverride(Token token, uint8 decimals) external onlyAdmin {
        _tokenDecimalsOverrides[token] = decimals;
    }

    /**
     * @inheritdoc IPoolTokenFactory
     */
    function createPoolToken(Token token) external validAddress(address(token)) returns (IPoolToken) {
        string memory customSymbol = _tokenSymbolOverrides[token];
        string memory tokenSymbol = bytes(customSymbol).length != 0 ? customSymbol : token.symbol();

        uint8 customDecimals = _tokenDecimalsOverrides[token];
        uint8 tokenDecimals = customDecimals != 0 ? customDecimals : token.decimals();

        string memory symbol = string.concat(POOL_TOKEN_SYMBOL_PREFIX, tokenSymbol);
        string memory name = string.concat(POOL_TOKEN_NAME_PREFIX, " ", tokenSymbol, " ", POOL_TOKEN_NAME_SUFFIX);

        PoolToken newPoolToken = new PoolToken(name, symbol, tokenDecimals, token);

        // make sure to transfer the ownership to the caller
        newPoolToken.transferOwnership(msg.sender);

        emit PoolTokenCreated({ poolToken: newPoolToken, token: token });

        return newPoolToken;
    }
}
