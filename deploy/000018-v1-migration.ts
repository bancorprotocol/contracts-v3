import { deploy, DeployedContracts, InstanceName, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bnt = await DeployedContracts.BNT.deployed();

    await deploy({
        name: InstanceName.BancorV1Migration,
        from: deployer,
        args: [network.address, networkSettings.address, bnt.address]
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
