import { ContractInstance, execute, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    await execute({
        name: ContractInstance.ProxyAdmin,
        methodName: 'transferOwnership',
        args: [daoMultisig],
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
