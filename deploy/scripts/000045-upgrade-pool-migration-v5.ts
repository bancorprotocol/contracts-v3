import { DeployedContracts, InstanceName, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetwork.deployed();

    await upgradeProxy({
        name: InstanceName.PoolMigrator,
        args: [network.address],
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
