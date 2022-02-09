// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.11;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IMasterVault } from "../../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../../vaults/interfaces/IExternalProtectionVault.sol";
import { IExternalRewardsVault } from "../../vaults/interfaces/IExternalRewardsVault.sol";

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";
import { IPoolCollectionUpgrader } from "../../pools/interfaces/IPoolCollectionUpgrader.sol";
import { IMasterPool } from "../../pools/interfaces/IMasterPool.sol";

import { IUpgradeable } from "../../utility/interfaces/IUpgradeable.sol";

import { Token } from "../../token/Token.sol";

import { IBancorNetworkInfo } from "./IBancorNetworkInfo.sol";
import { IBancorNetwork } from "./IBancorNetwork.sol";
import { INetworkSettings } from "./INetworkSettings.sol";
import { IPendingWithdrawals } from "./IPendingWithdrawals.sol";

/**
 * @dev Bancor Network Information interface
 */
interface IBancorNetworkInfo is IUpgradeable {
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
    function networkSettings() external view returns (INetworkSettings);

    /**
     * @dev returns the master vault contract
     */
    function masterVault() external view returns (IMasterVault);

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
     * @dev returns the output amount when trading by providing the source amount
     */
    function tradeOutputBySourceAmount(
        Token sourceToken,
        Token targetToken,
        uint256 sourceAmount
    ) external view returns (uint256);

    /**
     * @dev returns the input amount when trading by providing the target amount
     */
    function tradeInputByTargetAmount(
        Token sourceToken,
        Token targetToken,
        uint256 targetAmount
    ) external view returns (uint256);

    /**
     * @dev returns whether the given request is ready for withdrawal
     */
    function isReadyForWithdrawal(uint256 id) external view returns (bool);
}
