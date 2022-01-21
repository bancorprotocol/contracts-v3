import { ContractName, DeploymentTag } from '../utils/Constants';
import { deployProxy, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
    const govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    const masterPoolToken = await DeployedContracts.MasterPoolToken.deployed();

    await deployProxy(
        {
            name: ContractName.BancorNetworkProxy,
            contract: ContractName.BancorNetwork,
            from: deployer,
            args: [
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                masterVault.address,
                externalProtectionVault.address,
                masterPoolToken.address
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
    ContractName.NetworkSettings,
    ContractName.MasterVault,
    ContractName.ExternalProtectionVault,
    ContractName.MasterPoolToken
];
func.tags = [DeploymentTag.V3, ContractName.BancorNetworkProxy];

export default func;
