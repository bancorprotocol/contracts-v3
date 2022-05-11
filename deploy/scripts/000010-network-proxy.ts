import LegacyContractsV3ArtifactData from '../../components/LegacyContractsV3ArtifactData';
import { DeployedContracts, deployProxy, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();

    await deployProxy(
        {
            name: InstanceName.BancorNetworkProxy,
            contractArtifactData: LegacyContractsV3ArtifactData.BancorNetworkV1,
            from: deployer,
            args: [
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                bnBNT.address
            ]
        },
        {
            skipInitialization: true
        }
    );

    return true;
};

export default setDeploymentMetadata(__filename, func);
