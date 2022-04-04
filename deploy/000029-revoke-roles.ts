import { ContractInstance, grantRole, revokeRole, setDeploymentMetadata } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    for (const name of [
        ContractInstance.AutoCompoundingStakingRewards,
        ContractInstance.BancorNetworkInfo,
        ContractInstance.BancorNetwork,
        ContractInstance.BancorPortal,
        ContractInstance.BNTPool,
        ContractInstance.ExternalProtectionVault,
        ContractInstance.ExternalRewardsVault,
        ContractInstance.MasterVault,
        ContractInstance.NetworkSettings,
        ContractInstance.PendingWithdrawals,
        ContractInstance.PoolMigrator,
        ContractInstance.PoolTokenFactory,
        ContractInstance.StandardStakingRewards
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

export default setDeploymentMetadata(__filename, func);
