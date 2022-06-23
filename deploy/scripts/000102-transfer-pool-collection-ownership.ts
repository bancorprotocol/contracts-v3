import { execute, InstanceName, isLive, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { daoMultisig, foundationMultisig2 } = await getNamedAccounts();

    await execute({
        name: InstanceName.PoolCollectionType1V6,
        methodName: 'transferOwnership',
        args: [daoMultisig],
        from: foundationMultisig2
    });

    await execute({
        name: InstanceName.PoolCollectionType1V6,
        methodName: 'acceptOwnership',
        from: daoMultisig
    });

    return true;
};

// postpone the execution of this script to the end of the beta
func.skip = async () => isLive();

export default setDeploymentMetadata(__filename, func);
