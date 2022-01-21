import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deployProxy({
        name: ContractName.NetworkSettings,
        from: deployer
    });

    return true;
};

func.id = ContractName.NetworkSettings;
func.dependencies = [ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.NetworkSettings];

export default func;
