import { DeployedContracts, deployProxy, deploy, InstanceName, isMainnet, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { tenderly } from 'hardhat';

const tenderlyNetwork = tenderly.network();

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, uniswapV3Router, uniswapV2Router02, uniswapV2Factory, bancorNetworkV2, sushiSwapRouter } =
        await getNamedAccounts();

    const bnt = await DeployedContracts.BNT.deployed();
    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();

    const args = [network.address, networkSettings.address, bnt.address];
    if (isMainnet()) {
        args.push(uniswapV3Router, uniswapV2Router02, uniswapV2Factory, bancorNetworkV2, sushiSwapRouter);
    } else {
        const bancorV2Mock = await DeployedContracts.MockExchanges.deployed();
        const uniswapV3RouterMock = await DeployedContracts.MockExchanges.deployed();
        const uniswapV2FactoryMock = await DeployedContracts.MockExchanges.deployed();
        const uniswapV2RouterMock = await DeployedContracts.MockExchanges.deployed();
        const sushiswapV2RouterMock = await DeployedContracts.MockExchanges.deployed();
        args.push(
            uniswapV3RouterMock.address,
            uniswapV2FactoryMock.address,
            uniswapV2FactoryMock.address,
            bancorV2Mock.address,
            sushiswapV2RouterMock.address
        );
    }

    const contract = await deploy({
        name: InstanceName.BancorArbitrage,
        contract: 'BancorArbitrage',
        from: deployer,
        args
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
