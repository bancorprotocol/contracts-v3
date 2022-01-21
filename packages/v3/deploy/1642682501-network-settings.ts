import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, execute } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    await deployProxy({
        name: ContractName.NetworkSettings,
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettings,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, daoMultisig],
        from: deployer
    });

    await execute({
        name: ContractName.NetworkSettings,
        methodName: 'revokeRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, deployer],
        from: deployer
    });

    return true;
};

func.id = ContractName.NetworkSettings;
func.dependencies = [ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.NetworkSettings];

export default func;
