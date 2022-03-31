import { ContractName, DeploymentTag, upgradeProxy } from '../utils/Deploy';
import SetNetworkSettings from './1642682516-set-network-settings';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await upgradeProxy({
        name: ContractName.NetworkSettings,
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.NetworkSettingsV2;
func.dependencies = [DeploymentTag.NetworkSettingsV1, SetNetworkSettings.id!];
func.tags = [DeploymentTag.V3, DeploymentTag.NetworkSettingsV2];

export default func;
