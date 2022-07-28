import { execute, InstanceName, isLive, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    await execute({
        name: InstanceName.PoolCollectionType1V10,
        methodName: 'transferOwnership',
        args: [daoMultisig],
        from: deployer
    });

    await execute({
        name: InstanceName.PoolCollectionType1V10,
        methodName: 'acceptOwnership',
        from: daoMultisig
    });

    return true;
};

// postpone the execution of this script to the end of the beta
func.skip = async () => isLive();

export default setDeploymentMetadata(__filename, func);
