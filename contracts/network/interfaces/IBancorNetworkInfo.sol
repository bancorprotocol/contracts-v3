// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity 0.8.12;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ITokenGovernance } from "@bancor/token-governance/contracts/ITokenGovernance.sol";

import { IMasterVault } from "../../vaults/interfaces/IMasterVault.sol";
import { IExternalProtectionVault } from "../../vaults/interfaces/IExternalProtectionVault.sol";
import { IExternalRewardsVault } from "../../vaults/interfaces/IExternalRewardsVault.sol";

import { IPoolToken } from "../../pools/interfaces/IPoolToken.sol";
import { WithdrawalAmounts } from "../../pools/interfaces/IPoolCollection.sol";
import { IPoolCollectionUpgrader } from "../../pools/interfaces/IPoolCollectionUpgrader.sol";
import { IBNTPool } from "../../pools/interfaces/IBNTPool.sol";

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
     * @dev returns the BNT contract
     */
    function bnt() external view returns (IERC20);

    /**
     * @dev returns the BNT governance contract
     */
    function bntGovernance() external view returns (ITokenGovernance);

    /**
     * @dev returns the VBNT contract
     */
    function vbnt() external view returns (IERC20);

    /**
     * @dev returns the VBNT governance contract
     */
    function vbntGovernance() external view returns (ITokenGovernance);

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
     * @dev returns the BNT pool contract
     */
    function bntPool() external view returns (IBNTPool);

    /**
     * @dev returns the pool token contract for a given pool
     */
    function poolToken(Token pool) external view returns (IPoolToken);

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

    /**
     * @dev converts the specified pool token amount to the underlying token amount
     */
    function poolTokenToUnderlying(Token pool, uint256 poolTokenAmount) external view returns (uint256);

    /**
     * @dev converts the specified underlying base token amount to pool token amount
     */
    function underlyingToPoolToken(Token pool, uint256 tokenAmount) external view returns (uint256);

    /**
     * @dev returns the amounts that would be returned if the position is currently withdrawn,
     * along with the breakdown of the base token and the BNT compensation
     */
    function withdrawalAmounts(Token pool, uint256 poolTokenAmount) external view returns (WithdrawalAmounts memory);
}
