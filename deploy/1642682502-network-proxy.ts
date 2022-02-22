import { ContractName, DeploymentTag, deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const omniVault = await DeployedContracts.OmniVaultV1.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVaultV1.deployed();
    const omniPoolToken = await DeployedContracts.OmniPoolTokenV1.deployed();

    await deployProxy(
        {
            name: ContractName.BancorNetworkProxy,
            contract: ContractName.BancorNetworkV1,
            from: deployer,
            args: [
                bntGovernance.address,
                vbntGovernance.address,
                networkSettings.address,
                omniVault.address,
                externalProtectionVault.address,
                omniPoolToken.address
            ]
        },
        {
            skipInitialization: true
        }
    );

    return true;
};

func.id = ContractName.BancorNetworkProxy;
func.dependencies = [
    DeploymentTag.V2,
    ContractName.ProxyAdmin,
    ContractName.NetworkSettingsV1,
    ContractName.OmniVaultV1,
    ContractName.ExternalProtectionVaultV1,
    ContractName.OmniPoolTokenV1
];
func.tags = [DeploymentTag.V3, ContractName.BancorNetworkProxy];

export default func;
