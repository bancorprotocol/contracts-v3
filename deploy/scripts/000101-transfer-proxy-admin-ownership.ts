import { execute, InstanceName, isLive, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    await execute({
        name: InstanceName.ProxyAdmin,
        methodName: 'transferOwnership',
        args: [daoMultisig],
        from: deployer
    });

    return true;
};

// postpone the execution of this script to the end of the beta
func.skip = async () => isLive();

export default setDeploymentMetadata(__filename, func);
