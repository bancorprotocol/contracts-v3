// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { IVersioned } from "../utility/interfaces/IVersioned.sol";
import { IOwned } from "../utility/interfaces/IOwned.sol";
import { Utils } from "../utility/Utils.sol";

import { Token } from "../token/Token.sol";
import { TokenLibrary } from "../token/TokenLibrary.sol";

import { IBancorNetwork } from "./interfaces/IBancorNetwork.sol";
import { INetworkSettings } from "./interfaces/INetworkSettings.sol";

interface IDSToken is IERC20, IOwned {}

interface IBancorConverterV1 {
    function reserveTokens() external view returns (Token[] memory);

    function removeLiquidity(
        uint256 amount,
        Token[] memory reserveTokens,
        uint256[] memory reserveMinReturnAmounts
    ) external returns (uint256[] memory);
}

/**
 * @dev this contract supports V1 liquidity migration
 */
contract BancorV1Migration is IVersioned, ReentrancyGuard, Utils {
    using SafeERC20 for IERC20;
    using SafeERC20 for IDSToken;
    using TokenLibrary for Token;

    // the network contract
    IBancorNetwork private immutable _network;

    // the network settings contract
    INetworkSettings private immutable _networkSettings;

    // the address of the BNT token
    IERC20 private immutable _bnt;

    event PositionMigrated(
        address indexed provider,
        IDSToken poolToken,
        Token indexed tokenA,
        Token indexed tokenB,
        uint256 amountA,
        uint256 amountB,
        bool migratedA,
        bool migratedB
    );

    /**
     * @dev a "virtual" constructor that is only used to set immutable state variables
     */
    constructor(
        IBancorNetwork initNetwork,
        INetworkSettings initNetworkSettings,
        IERC20 initBNT
    ) validAddress(address(initNetwork)) validAddress(address(initNetworkSettings)) validAddress(address(initBNT)) {
        _network = initNetwork;
        _networkSettings = initNetworkSettings;
        _bnt = initBNT;
    }

    /**
     * @inheritdoc IVersioned
     */
    function version() public pure override(IVersioned) returns (uint16) {
        return 1;
    }

    /**
     * @dev authorize the contract to receive the native token
     */
    receive() external payable {}

    /**
     * @dev migrates pool tokens from v1 to v3
     *
     * requirements:
     *
     * - the caller must have approved this contract to transfer the pool tokens on its behalf
     */
    function migratePoolTokens(IDSToken poolToken, uint256 amount) external nonReentrant {
        poolToken.safeTransferFrom(msg.sender, address(this), amount);

        IBancorConverterV1 converter = IBancorConverterV1(payable(poolToken.owner()));

        Token[] memory reserveTokens = converter.reserveTokens();

        uint256[] memory minReturnAmounts = new uint256[](2);
        minReturnAmounts[0] = 1;
        minReturnAmounts[1] = 1;

        uint256[] memory reserveAmounts = converter.removeLiquidity(amount, reserveTokens, minReturnAmounts);

        bool[2] memory isMigrated;

        for (uint256 i = 0; i < 2; i++) {
            isMigrated[i] = reserveTokens[i].isEqual(_bnt) || _networkSettings.isTokenWhitelisted(reserveTokens[i]);
            if (isMigrated[i]) {
                if (reserveTokens[i].isNative()) {
                    _network.depositFor{ value: reserveAmounts[i] }(msg.sender, reserveTokens[i], reserveAmounts[i]);
                } else {
                    reserveTokens[i].safeApprove(address(_network), reserveAmounts[i]);
                    _network.depositFor(msg.sender, reserveTokens[i], reserveAmounts[i]);
                }
            } else {
                if (reserveTokens[i].isNative()) {
                    payable(msg.sender).transfer(reserveAmounts[i]);
                } else {
                    reserveTokens[i].safeTransfer(msg.sender, reserveAmounts[i]);
                }
            }
        }

        emit PositionMigrated({
            provider: msg.sender,
            poolToken: poolToken,
            tokenA: reserveTokens[0],
            tokenB: reserveTokens[1],
            amountA: reserveAmounts[0],
            amountB: reserveAmounts[1],
            migratedA: isMigrated[0],
            migratedB: isMigrated[1]
        });
    }
}
