import { ContractName, DeploymentTag, execute, toDeployTag } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    await execute({
        name: ContractName.ProxyAdmin,
        methodName: 'transferOwnership',
        args: [daoMultisig],
        from: deployer
    });

    return true;
};

const tag = toDeployTag(__filename);

func.id = tag;
func.dependencies = [DeploymentTag.ProxyAdmin];
func.tags = [DeploymentTag.V3, tag];

export default func;
