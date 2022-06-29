import { DeployedContracts, InstanceName, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();

    await upgradeProxy({
        name: InstanceName.BNTPool,
        args: [
            network.address,
            bntGovernance.address,
            vbntGovernance.address,
            networkSettings.address,
            masterVault.address,
            bnBNT.address
        ],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
