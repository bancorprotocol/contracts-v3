import { BancorNetworkV1__factory } from '../components/LegacyContracts';
import { ContractName, DeployedContracts, DeploymentTag, deployProxy } from '../utils/Deploy';
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
            contractFactory: BancorNetworkV1__factory, // eslint-disable-line camelcase
            legacy: true,
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

func.id = DeploymentTag.BancorNetworkProxy;
func.dependencies = [
    DeploymentTag.V2,
    DeploymentTag.ProxyAdmin,
    DeploymentTag.NetworkSettingsV1,
    DeploymentTag.MasterVaultV1,
    DeploymentTag.ExternalProtectionVaultV1,
    DeploymentTag.BNTPoolTokenV1
];
func.tags = [DeploymentTag.V3, DeploymentTag.BancorNetworkProxy];

export default func;
