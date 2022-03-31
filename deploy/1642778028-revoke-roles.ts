import { ContractName, DeploymentTag, grantRole, revokeRole, toDeployTag } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const CONTRACT_NAMES_TO_REVOKE = [
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
];

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    for (const name of CONTRACT_NAMES_TO_REVOKE) {
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
func.dependencies = CONTRACT_NAMES_TO_REVOKE;
func.tags = [DeploymentTag.V3, tag];

export default func;
