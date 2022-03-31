import { ContractName, deploy, DeploymentTag, execute } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, daoMultisig } = await getNamedAccounts();

    await deploy({
        name: ContractName.ProxyAdmin,
        from: deployer
    });

    await execute({
        name: ContractName.ProxyAdmin,
        methodName: 'transferOwnership',
        args: [daoMultisig],
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.ProxyAdmin;
func.tags = [DeploymentTag.V3, DeploymentTag.ProxyAdmin];

export default func;
