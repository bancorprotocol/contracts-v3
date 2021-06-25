// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.7.6;

import "../../utility/interfaces/IVersioned.sol";

import "../../token/interfaces/IReserveToken.sol";

/**
 * @dev Bancor Vault interface
 */
interface IBancorVault is IVersioned {
    receive() external payable;

    function isPaused() external view returns (bool);

    function pause() external;

    function unpause() external;

    function withdrawTokens(
        IReserveToken reserveToken,
        address payable target,
        uint256 amount
    ) external;
}
