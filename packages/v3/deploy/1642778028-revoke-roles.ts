import { ContractName, DeploymentTag } from '../utils/Constants';
import { execute } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    for (const name of [
        ContractName.MasterVault,
        ContractName.ExternalProtectionVault,
        ContractName.ExternalRewardsVault,
        ContractName.PoolTokenFactory,
        ContractName.NetworkSettings,
        ContractName.MasterPool,
        ContractName.PendingWithdrawals,
        ContractName.PoolCollectionUpgrader,
        ContractName.BancorNetwork,
        ContractName.BancorNetworkInfo
    ]) {
        await execute({
            name,
            methodName: 'grantRole',
            args: [Roles.Upgradeable.ROLE_ADMIN, daoMultisig],
            from: deployer
        });

        await execute({
            name,
            methodName: 'revokeRole',
            args: [Roles.Upgradeable.ROLE_ADMIN, deployer],
            from: deployer
        });
    }

    return true;
};

func.id = 'RevokeRoles';
func.dependencies = [
    ContractName.MasterVault,
    ContractName.ExternalProtectionVault,
    ContractName.ExternalRewardsVault,
    ContractName.PoolTokenFactory,
    ContractName.NetworkSettings,
    ContractName.MasterPool,
    ContractName.PendingWithdrawals,
    ContractName.PoolCollectionUpgrader,
    ContractName.BancorNetwork,
    ContractName.BancorNetworkInfo
];
func.tags = [DeploymentTag.V3];

export default func;
