import { ContractName, DeployedContracts, DeploymentTag, deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();

    await deployProxy({
        name: ContractName.PoolMigrator,
        from: deployer,
        args: [networkProxy.address]
    });

    return true;
};

func.id = DeploymentTag.PoolMigratorV1;
func.dependencies = [DeploymentTag.V2, DeploymentTag.ProxyAdmin, DeploymentTag.BancorNetworkProxy];
func.tags = [DeploymentTag.V3, DeploymentTag.PoolMigratorV1];

export default func;
