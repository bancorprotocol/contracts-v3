import { DeployedContracts, InstanceName, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();
    const vbnt = await DeployedContracts.VBNT.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const externalStandardRewardsVault = await DeployedContracts.ExternalStandardRewardsVault.deployed();

    await upgradeProxy({
        name: InstanceName.StandardRewards,
        args: [
            network.address,
            networkSettings.address,
            bntGovernance.address,
            vbnt.address,
            bntPool.address,
            externalStandardRewardsVault.address
        ],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
