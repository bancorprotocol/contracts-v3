import { DeployedContracts, InstanceName, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, uniswapV2Router02, uniswapV2Factory, sushiSwapRouter, sushiSwapFactory } =
        await getNamedAccounts();

    const bnt = await DeployedContracts.BNT.deployed();
    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();

    await upgradeProxy({
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
