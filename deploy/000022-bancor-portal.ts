import { ContractInstance, DeployedContracts, deployProxy, isMainnet, setDeploymentMetadata } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, uniswapV2Router02, uniswapV2Factory, sushiSwapRouter, sushiSwapFactory } =
        await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const bnt = await DeployedContracts.BNT.deployed();

    if (isMainnet()) {
        await deployProxy({
            name: ContractInstance.BancorPortal,
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
    } else {
        const uniswapV2RouterMock = await DeployedContracts.MockUniswapV2Router02.deployed();
        const uniswapV2FactoryMock = await DeployedContracts.MockUniswapV2Factory.deployed();

        await deployProxy({
            name: ContractInstance.BancorPortal,
            from: deployer,
            args: [
                network.address,
                networkSettings.address,
                bnt.address,
                uniswapV2RouterMock.address,
                uniswapV2FactoryMock.address,
                uniswapV2RouterMock.address,
                uniswapV2FactoryMock.address
            ]
        });
    }

    return true;
};

setDeploymentMetadata(__filename, func);

export default func;
