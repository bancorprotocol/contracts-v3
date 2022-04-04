import { ContractName, deploy, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deploy({
        name: ContractName.ProxyAdmin,
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
