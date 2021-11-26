// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.10;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IBancorVault } from "../../vaults/interfaces/IBancorVault.sol";
import { IExternalProtectionVault } from "../../vaults/interfaces/IExternalProtectionVault.sol";
import { IExternalRewardsVault } from "../../vaults/interfaces/IExternalRewardsVault.sol";

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";
import { IPoolCollectionUpgrader } from "../../pools/interfaces/IPoolCollectionUpgrader.sol";
import { IMasterPool } from "../../pools/interfaces/IMasterPool.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { ReserveToken } from "../../token/ReserveToken.sol";

import { IBancorNetworkInformation } from "./IBancorNetworkInformation.sol";
import { IBancorNetwork } from "./IBancorNetwork.sol";
import { INetworkSettings } from "./INetworkSettings.sol";
import { IPendingWithdrawals } from "./IPendingWithdrawals.sol";

/**
 * @dev Bancor Network Information interface
 */
interface IBancorNetworkInformation is IUpgradeable {
    /**
     * @dev returns the network contract
     */
    function network() external view returns (IBancorNetwork);

    /**
     * @dev returns the network token contract
     */
    function networkToken() external view returns (IERC20);

    /**
     * @dev returns the network token governance contract
     */
    function networkTokenGovernance() external view returns (ITokenGovernance);

    /**
     * @dev returns the governance token contract
     */
    function govToken() external view returns (IERC20);

    /**
     * @dev returns the governance token governance contract
     */
    function govTokenGovernance() external view returns (ITokenGovernance);

    /**
     * @dev returns the network settings contract
     */
    function settings() external view returns (INetworkSettings);

    /**
     * @dev returns the vault contract
     */
    function vault() external view returns (IBancorVault);

    /**
     * @dev returns the address of the external protection vault
     */
    function externalProtectionVault() external view returns (IExternalProtectionVault);

    /**
     * @dev returns the address of the external rewards vault
     */
    function externalRewardsVault() external view returns (IExternalRewardsVault);

    /**
     * @dev returns the master pool contract
     */
    function masterPool() external view returns (IMasterPool);

    /**
     * @dev returns the master pool token contract
     */
    function masterPoolToken() external view returns (IPoolToken);

    /**
     * @dev returns the pending withdrawals contract
     */
    function pendingWithdrawals() external view returns (IPendingWithdrawals);

    /**
     * @dev returns the pool collection upgrader contract
     */
    function poolCollectionUpgrader() external view returns (IPoolCollectionUpgrader);

    /**
     * @dev returns the target amount by specifying the source amount
     */
    function tradeTargetAmount(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 sourceAmount
    ) external view returns (uint256);

    /**
     * @dev returns the source amount by specifying the target amount
     */
    function tradeSourceAmount(
        ReserveToken sourceToken,
        ReserveToken targetToken,
        uint256 targetAmount
    ) external view returns (uint256);
}
