import LegacyContractsV3ArtifactData from '../../components/LegacyContractsV3ArtifactData';
import { DeployedContracts, deployProxy, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();

    await deployProxy({
        name: InstanceName.PoolMigrator,
        contractArtifactData: LegacyContractsV3ArtifactData.PoolMigratorV1,
        from: deployer,
        args: [networkProxy.address]
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
