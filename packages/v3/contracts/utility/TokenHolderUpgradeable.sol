// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../token/ReserveToken.sol";

import "./interfaces/ITokenHolder.sol";

import "./OwnedUpgradeable.sol";
import "./Utils.sol";

/**
 * @dev This contract provides an owned token and ETH wallet
 */
contract TokenHolderUpgradeable is ITokenHolder, OwnedUpgradeable, Utils {
    using ReserveToken for IReserveToken;

    // upgrade forward-compatibility storage gap
    uint256[MAX_GAP - 0] private __gap;

    function initialize() external initializer {
        __TokenHolderUpgradeable_init();
    }

    // solhint-disable func-name-mixedcase

    /**
     * @dev initializes the contract and its parents
     */
    function __TokenHolderUpgradeable_init() internal initializer {
        __Owned_init();

        __TokenHolderUpgradeable_init_unchained();
    }

    /**
     * @dev performs contract-specific initialization
     */
    function __TokenHolderUpgradeable_init_unchained() internal initializer {}

    receive() external payable virtual override {}

    // solhint-enable func-name-mixedcase

    /**
     * @dev returns the current version of the contract
     */
    function version() external pure override returns (uint16) {
        return 1;
    }

    /**
     * @dev withdraws funds held by the contract and sends them to an account
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function withdrawTokens(
        IReserveToken reserveToken,
        address payable to,
        uint256 amount
    ) external virtual override onlyOwner validAddress(to) {
        reserveToken.safeTransfer(to, amount);
    }

    /**
     * @dev withdraws multiple funds held by the contract and sends them to an account
     *
     * requirements:
     *
     * - the caller must be the owner of the contract
     */
    function withdrawTokensMultiple(
        IReserveToken[] calldata reserveTokens,
        address payable to,
        uint256[] calldata amounts
    ) external virtual override onlyOwner validAddress(to) {
        uint256 length = reserveTokens.length;
        require(length == amounts.length, "ERR_INVALID_LENGTH");

        for (uint256 i = 0; i < length; ++i) {
            reserveTokens[i].safeTransfer(to, amounts[i]);
        }
    }
}
