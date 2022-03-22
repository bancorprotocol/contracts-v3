import { ContractName, DeployedContracts, DeploymentTag, deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();

    await deployProxy({
        name: ContractName.PoolCollectionUpgraderV1,
        from: deployer,
        args: [networkProxy.address]
    });

    return true;
};

func.id = ContractName.PoolCollectionUpgraderV1;
func.dependencies = [DeploymentTag.V2, ContractName.ProxyAdmin, ContractName.BancorNetworkProxy];
func.tags = [DeploymentTag.V3, ContractName.PoolCollectionUpgraderV1];

export default func;
