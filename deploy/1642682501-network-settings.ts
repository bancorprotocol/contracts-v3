import LegacyContractsArtifactData from '../components/LegacyContractsArtifactData';
import { ContractName, DeploymentTag, deployProxy } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deployProxy({
        name: ContractName.NetworkSettings,
        contractArtifactData: LegacyContractsArtifactData.NetworkSettingsV1,
        from: deployer
    });

    return true;
};

func.id = DeploymentTag.NetworkSettingsV1;
func.dependencies = [DeploymentTag.ProxyAdmin];
func.tags = [DeploymentTag.V3, DeploymentTag.NetworkSettingsV1];

export default func;
