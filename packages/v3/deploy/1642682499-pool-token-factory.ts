import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deployProxy({
        name: ContractName.PoolTokenFactoryV1,
        from: deployer
    });

    return true;
};

func.id = ContractName.PoolTokenFactoryV1;
func.dependencies = [ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.PoolTokenFactoryV1];

export default func;
