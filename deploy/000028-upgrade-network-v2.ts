import { ContractInstance, DeployedContracts, setDeploymentMetadata, upgradeProxy } from '../utils/Deploy';
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

    await upgradeProxy({
        name: ContractInstance.BancorNetwork,
        args: [
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            externalProtectionVault.address,
            bntPoolToken.address
        ],
        from: deployer
    });

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
