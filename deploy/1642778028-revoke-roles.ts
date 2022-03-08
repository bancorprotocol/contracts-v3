import { ContractName, DeploymentTag, grantRole, revokeRole } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const CONTRACT_NAMES_TO_REVOKE = [
    ContractName.AutoCompoundingStakingRewardsV1,
    ContractName.BancorNetworkInfoV1,
    ContractName.BancorNetworkV1,
    ContractName.BancorPortalV1,
    ContractName.BNTPoolV1,
    ContractName.ExternalProtectionVaultV1,
    ContractName.ExternalRewardsVaultV1,
    ContractName.MasterVaultV1,
    ContractName.NetworkSettingsV1,
    ContractName.PendingWithdrawalsV1,
    ContractName.PoolCollectionUpgraderV1,
    ContractName.PoolTokenFactoryV1,
    ContractName.StandardStakingRewardsV1
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

func.id = 'RevokeRoles';
func.dependencies = CONTRACT_NAMES_TO_REVOKE;
func.tags = [DeploymentTag.V3];

export default func;
