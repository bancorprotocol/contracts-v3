import LegacyContractsV3ArtifactData from '../../components/LegacyContractsV3ArtifactData';
import { DeployedContracts, InstanceName, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();

    await upgradeProxy({
        name: InstanceName.StandardRewards,
        contractArtifactData: LegacyContractsV3ArtifactData.StandardRewardsV2,
        args: [
            network.address,
            networkSettings.address,
            bntGovernance.address,
            bntPool.address,
            externalRewardsVault.address
        ],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
