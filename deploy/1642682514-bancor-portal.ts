import { deployProxy, ContractName, DeploymentTag, DeployedContracts, isMainnet } from '../utils/Deploy';
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
            name: ContractName.BancorPortalV1,
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
        const uniswapV2RouterMock = await DeployedContracts.MockUniswapV2Router02V1.deployed();
        const uniswapV2FactoryMock = await DeployedContracts.MockUniswapV2FactoryV1.deployed();

        await deployProxy({
            name: ContractName.BancorPortalV1,
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

func.id = ContractName.BancorPortalV1;
func.dependencies = [
    ContractName.ProxyAdmin,
    ContractName.BancorNetworkV1,
    ContractName.NetworkSettingsV1,
    ContractName.BNT,
    ContractName.MockUniswapV2FactoryV1,
    ContractName.MockUniswapV2Router02V1
];
func.tags = [DeploymentTag.V3, ContractName.BancorPortalV1];

export default func;
