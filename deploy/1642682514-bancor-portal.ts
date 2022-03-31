import { ContractName, DeployedContracts, DeploymentTag, deployProxy, isMainnet } from '../utils/Deploy';
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
            name: ContractName.BancorPortal,
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
            name: ContractName.BancorPortal,
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

func.id = DeploymentTag.BancorPortalV1;
func.dependencies = [
    DeploymentTag.ProxyAdmin,
    DeploymentTag.BancorNetworkV1,
    DeploymentTag.NetworkSettingsV1,
    DeploymentTag.BNT,
    DeploymentTag.MockUniswapV2Factory,
    DeploymentTag.MockUniswapV2Router02
];
func.tags = [DeploymentTag.V3, DeploymentTag.BancorPortalV1];

export default func;
