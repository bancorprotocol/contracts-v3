import { ContractName, DeploymentTag, grantRole, revokeRole, toDeployTag } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    for (const name of [
        ContractName.AutoCompoundingStakingRewards,
        ContractName.BancorNetworkInfo,
        ContractName.BancorNetwork,
        ContractName.BancorPortal,
        ContractName.BNTPool,
        ContractName.ExternalProtectionVault,
        ContractName.ExternalRewardsVault,
        ContractName.MasterVault,
        ContractName.NetworkSettings,
        ContractName.PendingWithdrawals,
        ContractName.PoolMigrator,
        ContractName.PoolTokenFactory,
        ContractName.StandardStakingRewards
    ]) {
        await grantRole({
            name,
            id: Roles.Upgradeable.ROLE_ADMIN,
            member: daoMultisig,
            from: deployer
        });

        await revokeRole({
            name,
            id: Roles.Upgradeable.ROLE_ADMIN,
            member: deployer,
            from: deployer
        });
    }

    return true;
};

const tag = toDeployTag(__filename);

func.id = tag;
func.dependencies = [
    DeploymentTag.AutoCompoundingStakingRewardsV1,
    DeploymentTag.BancorNetworkInfoV1,
    DeploymentTag.BancorNetworkV2,
    DeploymentTag.BancorPortalV1,
    DeploymentTag.BNTPoolV1,
    DeploymentTag.ExternalProtectionVaultV1,
    DeploymentTag.ExternalRewardsVaultV1,
    DeploymentTag.MasterVaultV1,
    DeploymentTag.NetworkSettingsV2,
    DeploymentTag.PendingWithdrawalsV1,
    DeploymentTag.PoolMigratorV1,
    DeploymentTag.PoolTokenFactoryV1,
    DeploymentTag.StandardStakingRewardsV1
];
func.tags = [DeploymentTag.V3, tag];

export default func;
