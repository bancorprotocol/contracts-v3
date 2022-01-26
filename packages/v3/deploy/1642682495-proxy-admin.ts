import { ContractName, DeploymentTag, deploy, execute } from '../utils/Deploy';
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

func.id = ContractName.ProxyAdmin;
func.tags = [DeploymentTag.V3, ContractName.ProxyAdmin];

export default func;
