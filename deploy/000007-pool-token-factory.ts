import { deployProxy, InstanceName, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deployProxy({
        name: InstanceName.PoolTokenFactory,
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
