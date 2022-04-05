import { ContractName, DeploymentTag, deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deployProxy({
        name: ContractName.PoolTokenFactory,
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.PoolTokenFactoryV1;
func.dependencies = [DeploymentTag.ProxyAdmin];
func.tags = [DeploymentTag.V3, DeploymentTag.PoolTokenFactoryV1];

export default func;
