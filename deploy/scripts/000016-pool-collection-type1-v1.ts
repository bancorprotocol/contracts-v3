import LegacyContractsV3ArtifactData from '../../components/LegacyContractsV3ArtifactData';
import { deploy, DeployedContracts, execute, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const bnt = await DeployedContracts.BNT.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();

    const bntPool = await DeployedContracts.BNTPool.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    const poolMigrator = await DeployedContracts.PoolMigratorV1.deployed();

    const poolCollectionAddress = await deploy({
        name: InstanceName.PoolCollectionType1V1,
        contractArtifactData: LegacyContractsV3ArtifactData.PoolCollectionType1V1,
        from: deployer,
        args: [
            network.address,
            bnt.address,
            networkSettings.address,
            masterVault.address,
            bntPool.address,
            externalProtectionVault.address,
            poolTokenFactory.address,
            poolMigrator.address
        ]
    });

    await execute({
        name: InstanceName.BancorNetwork,
        methodName: 'addPoolCollection',
        args: [poolCollectionAddress],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
