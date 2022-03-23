import { ContractName, DeployedContracts, DeploymentTag, deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();

    await deployProxy({
        name: ContractName.PoolMigratorV1,
        from: deployer,
        args: [networkProxy.address]
    });

    return true;
};

func.id = ContractName.PoolMigratorV1;
func.dependencies = [DeploymentTag.V2, ContractName.ProxyAdmin, ContractName.BancorNetworkProxy];
func.tags = [DeploymentTag.V3, ContractName.PoolMigratorV1];

export default func;
