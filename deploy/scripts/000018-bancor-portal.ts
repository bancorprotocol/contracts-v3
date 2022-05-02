import { DeployedContracts, deployProxy, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, uniswapV2Router02, uniswapV2Factory, sushiSwapRouter, sushiSwapFactory } =
        await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bnt = await DeployedContracts.BNT.deployed();

    await deployProxy({
        name: InstanceName.BancorPortal,
        from: deployer,
        args: [
            network.address,
            networkSettings.address,
            bnt.address,
            uniswapV2Router02,
            uniswapV2Factory,
            sushiSwapRouter,
            sushiSwapFactory
        ]
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
