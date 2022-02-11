import { deployProxy, ContractName, DeploymentTag, DeployedContracts } from '../utils/Deploy';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const network = await DeployedContracts.BancorNetworkV1.deployed();
    const networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    const networkToken = await DeployedContracts.NetworkToken.deployed();
    const uniswapV2Router = await DeployedContracts.MockUniswapV2Router02V1.deployed();
    const uniswapV2Factory = await DeployedContracts.MockUniswapV2FactoryV1.deployed();

    await deployProxy({
        name: ContractName.BancorPortalV1,
        from: deployer,
        args: [
            network.address,
            networkSettings.address,
            networkToken.address,
            uniswapV2Router.address,
            uniswapV2Factory.address,
            uniswapV2Router.address,
            uniswapV2Factory.address
        ]
    });

    return true;
};

func.id = ContractName.BancorPortalV1;
func.dependencies = [
    DeploymentTag.V3,
    ContractName.BancorNetworkV1,
    ContractName.NetworkSettingsV1,
    ContractName.NetworkToken,
    ContractName.MockUniswapV2FactoryV1,
    ContractName.MockUniswapV2Router02V1
];
// func.tags = [DeploymentTag.V3, ContractName.BancorPortalV1];

export default func;
