import { execute, InstanceName, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    await execute({
        name: InstanceName.PoolCollectionType1V1,
        methodName: 'transferOwnership',
        args: [daoMultisig],
        from: deployer
    });

    await execute({
        name: InstanceName.PoolCollectionType1V1,
        methodName: 'acceptOwnership',
        from: daoMultisig
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
