import { DeployedContracts, InstanceName, isMainnet, setDeploymentMetadata, upgradeProxy } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, uniswapV2Router02, uniswapV2Factory, sushiSwapRouter, sushiSwapFactory, weth } =
        await getNamedAccounts();

    const bnt = await DeployedContracts.BNT.deployed();
    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();

    const args = [network.address, networkSettings.address, bnt.address];
    if (isMainnet()) {
        args.push(uniswapV2Router02, uniswapV2Factory, sushiSwapRouter, sushiSwapFactory, weth);
    } else {
        const uniswapV2FactoryMock = await DeployedContracts.MockUniswapV2Factory.deployed();
        const uniswapV2RouterMock = await DeployedContracts.MockUniswapV2Router02.deployed();
        args.push(
            uniswapV2RouterMock.address,
            uniswapV2FactoryMock.address,
            uniswapV2RouterMock.address,
            uniswapV2FactoryMock.address,
            weth
        );
    }

    await upgradeProxy({
        name: InstanceName.BancorPortal,
        from: deployer,
        args
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
