// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import { IReserveToken } from "../token/interfaces/IReserveToken.sol";
import { ReserveToken } from "../token/ReserveToken.sol";

import { Upgradeable } from "../utility/Upgradeable.sol";
import { Utils } from "../utility/Utils.sol";
import { OwnedUpgradeable } from "../utility/OwnedUpgradeable.sol";

import { IPoolTokenFactory } from "./interfaces/IPoolTokenFactory.sol";
import { IPoolToken } from "./interfaces/IPoolToken.sol";
import { PoolToken } from "./PoolToken.sol";

/**
 * @dev Pool Token Factory contract
 */
contract PoolTokenFactory is IPoolTokenFactory, Upgradeable, OwnedUpgradeable, Utils {
    using ReserveToken for IReserveToken;

    string private constant POOL_TOKEN_SYMBOL_PREFIX = "bn";
    string private constant POOL_TOKEN_NAME_PREFIX = "Bancor";
    string private constant POOL_TOKEN_NAME_SUFFIX = "Pool Token";

    // a mapping between reserve tokens and custom symbol overrides (only needed for tokens with malformed symbol property)
    mapping(IReserveToken => string) private _tokenSymbolOverrides;

    // a mapping between reserve tokens and custom token overrides (only needed for tokens with malformed decimals property)
    mapping(IReserveToken => uint8) private _tokenDecimalsOverrides;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 2] private __gap;

    /**
     * @dev triggered when a pool token is created
     */
    event PoolTokenCreated(IPoolToken indexed poolToken, IReserveToken indexed reserveToken);

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
    function __PoolTokenFactory_init() internal initializer {
        __Owned_init();

        __PoolTokenFactory_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __PoolTokenFactory_init_unchained() internal initializer {}

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @inheritdoc IPoolTokenFactory
     */
    function tokenSymbolOverride(IReserveToken reserveToken) external view override returns (string memory) {
        return _tokenSymbolOverrides[reserveToken];
    }

    /**
     * @dev sets the custom symbol override for a given reserve token
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setTokenSymbolOverride(IReserveToken reserveToken, string calldata symbolOverride) external onlyOwner {
        _tokenSymbolOverrides[reserveToken] = symbolOverride;
    }

    /**
     * @inheritdoc IPoolTokenFactory
     */
    function tokenDecimalsOverride(IReserveToken reserveToken) external view override returns (uint8) {
        return _tokenDecimalsOverrides[reserveToken];
    }

    /**
     * @dev sets the decimals override for a given reserve token
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function setTokenDecimalsOverride(IReserveToken reserveToken, uint8 decimals) external onlyOwner {
        _tokenDecimalsOverrides[reserveToken] = decimals;
    }

    /**
     * @inheritdoc IPoolTokenFactory
     */
    function createPoolToken(IReserveToken reserveToken)
        external
        override
        validAddress(address(reserveToken))
        returns (IPoolToken)
    {
        string memory customSymbol = _tokenSymbolOverrides[reserveToken];
        string memory tokenSymbol = bytes(customSymbol).length != 0 ? customSymbol : reserveToken.symbol();

        uint8 customTokenDecimals = _tokenDecimalsOverrides[reserveToken];
        uint8 tokenDecimals = customTokenDecimals != 0 ? customTokenDecimals : reserveToken.decimals();

        string memory symbol = string(abi.encodePacked(POOL_TOKEN_SYMBOL_PREFIX, tokenSymbol));
        string memory name = string(
            abi.encodePacked(POOL_TOKEN_NAME_PREFIX, " ", tokenSymbol, " ", POOL_TOKEN_NAME_SUFFIX)
        );

        PoolToken newPoolToken = new PoolToken(name, symbol, tokenDecimals, reserveToken);

        // make sure to transfer the ownership to the caller
        newPoolToken.transferOwnership(msg.sender);

        emit PoolTokenCreated({ poolToken: newPoolToken, reserveToken: reserveToken });

        return newPoolToken;
    }
}
