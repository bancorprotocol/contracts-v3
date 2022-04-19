import { grantRole, InstanceName, isLive, revokeRole, setDeploymentMetadata } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    for (const name of [
        InstanceName.BancorNetworkInfo,
        InstanceName.BancorNetwork,
        InstanceName.BancorPortal,
        InstanceName.BNTPool,
        InstanceName.ExternalProtectionVault,
        InstanceName.ExternalRewardsVault,
        InstanceName.MasterVault,
        InstanceName.NetworkSettings,
        InstanceName.PendingWithdrawals,
        InstanceName.PoolMigrator,
        InstanceName.PoolTokenFactory,
        InstanceName.StandardRewards
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

// postpone the execution of this script to the end of the beta
func.skip = async () => isLive();

export default setDeploymentMetadata(__filename, func);
