import { ContractName, DeploymentTag } from '../utils/Constants';
import { execute } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const CONTRACT_NAMES_TO_REVOKE = [
    ContractName.MasterVaultV1,
    ContractName.ExternalProtectionVaultV1,
    ContractName.ExternalRewardsVaultV1,
    ContractName.PoolTokenFactoryV1,
    ContractName.NetworkSettingsV1,
    ContractName.MasterPoolV1,
    ContractName.PendingWithdrawalsV1,
    ContractName.PoolCollectionUpgraderV1,
    ContractName.BancorNetworkV1,
    ContractName.BancorNetworkInfoV1
];

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    for (const name of CONTRACT_NAMES_TO_REVOKE) {
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
func.dependencies = CONTRACT_NAMES_TO_REVOKE;
func.tags = [DeploymentTag.V3];

export default func;
