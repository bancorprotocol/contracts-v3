import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, execute, DeployedContracts } from '../utils/Deploy';
import { Roles } from '../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();

    await deployProxy({
        name: ContractName.PoolCollectionUpgrader,
        from: deployer,
        args: [networkProxy.address]
    });

    await execute({
        name: ContractName.PoolCollectionUpgrader,
        methodName: 'grantRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, daoMultisig],
        from: deployer
    });

    await execute({
        name: ContractName.PoolCollectionUpgrader,
        methodName: 'revokeRole',
        args: [Roles.Upgradeable.ROLE_ADMIN, deployer],
        from: deployer
    });

    return true;
};

func.id = ContractName.PoolCollectionUpgrader;
func.dependencies = [DeploymentTag.V2, ContractName.ProxyAdmin, ContractName.BancorNetworkProxy];
func.tags = [DeploymentTag.V3, ContractName.PoolCollectionUpgrader];

export default func;
