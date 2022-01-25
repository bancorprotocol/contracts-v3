import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deployProxy({
        name: ContractName.NetworkSettingsV1,
        from: deployer
    });

    return true;
};

func.id = ContractName.NetworkSettingsV1;
func.dependencies = [ContractName.ProxyAdmin];
func.tags = [DeploymentTag.V3, ContractName.NetworkSettingsV1];

export default func;
