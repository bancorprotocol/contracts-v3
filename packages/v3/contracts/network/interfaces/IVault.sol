// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.9;

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

interface IVault is IUpgradeable {
    /**
     * @dev triggered when tokens have been withdrawn from the vault
     */
    event FundsWithdrawn(ReserveToken indexed token, address indexed caller, address indexed target, uint256 amount);

    /**
     * @dev
     */
    function withdrawFunds(
        ReserveToken token,
        uint256 amount,
        address target
    ) external;

    /**
     * @dev
     */
    function authenticateWithdrawal(
        address caller,
        ReserveToken token,
        uint256 amount,
        address target
    ) external;
}
