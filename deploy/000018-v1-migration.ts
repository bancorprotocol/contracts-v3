import { ContractInstance, deploy, DeployedContracts, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bnt = await DeployedContracts.BNT.deployed();

    await deploy({
        name: ContractInstance.BancorV1Migration,
        from: deployer,
        args: [network.address, networkSettings.address, bnt.address]
    });

    return true;
};

setDeploymentMetadata(__filename, func);
export default func;
