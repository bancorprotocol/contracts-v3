import LegacyContractsV3ArtifactData from '../components/LegacyContractsV3ArtifactData';
import { ContractName, DeployedContracts, deployProxy, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const bntPoolToken = await DeployedContracts.BNTPoolToken.deployed();

    await deployProxy(
        {
            name: ContractName.BancorNetworkProxy,
            contractArtifactData: LegacyContractsV3ArtifactData.BancorNetworkV1,
            from: deployer,
            args: [
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                bntPoolToken.address
            ]
        },
        {
            skipInitialization: true
        }
    );

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
