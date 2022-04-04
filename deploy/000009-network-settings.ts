import LegacyContractsV3ArtifactData from '../components/LegacyContractsV3ArtifactData';
import { ContractName, deployProxy, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deployProxy({
        name: ContractName.NetworkSettings,
        contractArtifactData: LegacyContractsV3ArtifactData.NetworkSettingsV1,
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
