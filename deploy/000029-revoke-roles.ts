import { ContractName, grantRole, revokeRole, setDeploymentMetadata } from '../utils/Deploy';
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

setDeploymentMetadata(__filename, func);

export default func;
