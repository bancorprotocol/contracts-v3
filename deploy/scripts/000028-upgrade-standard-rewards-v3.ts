import { DeployedContracts, InstanceName, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV2.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbnt = await DeployedContracts.VBNT.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();

    await upgradeProxy({
        name: InstanceName.StandardRewards,
        args: [
            network.address,
            networkSettings.address,
            bntGovernance.address,
            vbnt.address,
            bntPool.address,
            externalRewardsVault.address
        ],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
