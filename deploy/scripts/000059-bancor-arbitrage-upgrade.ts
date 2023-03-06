import { DeployedContracts, upgradeProxy, InstanceName, isMainnet, setDeploymentMetadata } from '../../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, uniswapV2Router02, uniswapV3Router, sushiSwapRouter } = await getNamedAccounts();

    const bnt = await DeployedContracts.BNT.deployed();
    const bancorNetworkV2 = await DeployedContracts.LegacyBancorNetwork.deployed();
    const bancorNetworkV3 = await DeployedContracts.BancorNetwork.deployed();

    if (isMainnet()) {
        await upgradeProxy({
            name: InstanceName.BancorArbitrage,
            from: deployer,
            args: [
                bnt.address,
                bancorNetworkV2.address,
                bancorNetworkV3.address,
                uniswapV2Router02,
                uniswapV3Router,
                sushiSwapRouter
            ]
        });
    } else {
        const mockExchanges = await DeployedContracts.MockExchanges.deployed();

        await upgradeProxy({
            name: InstanceName.BancorArbitrage,
            from: deployer,
            args: [
                bnt.address,
                mockExchanges.address,
                bancorNetworkV3.address,
                mockExchanges.address,
                mockExchanges.address,
                mockExchanges.address
            ]
        });
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
