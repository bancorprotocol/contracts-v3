// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.13;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { Token } from "../../token/Token.sol";

// the asset manager role is required to access all the funds
bytes32 constant ROLE_ASSET_MANAGER = keccak256("ROLE_ASSET_MANAGER");

interface IVault is IUpgradeable {
    /**
     * @dev triggered when tokens have been withdrawn from the vault
     */
    event FundsWithdrawn(Token indexed token, address indexed caller, address indexed target, uint256 amount);

    /**
     * @dev triggered when tokens have been burned from the vault
     */
    event FundsBurned(Token indexed token, address indexed caller, uint256 amount);

    /**
     * @dev tells whether the vault accepts native token deposits
     */
    function isPayable() external view returns (bool);

    /**
     * @dev withdraws funds held by the contract and sends them to an account
     */
    function withdrawFunds(
        Token token,
        address payable target,
        uint256 amount
    ) external;

    /**
     * @dev burns funds held by the contract
     */
    function burn(Token token, uint256 amount) external;
}
