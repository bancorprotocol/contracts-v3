import { ContractName, deploy, DeployedContracts, DeploymentTag, isMainnet } from '../utils/Deploy';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const uniswapPair = await DeployedContracts.MockUniswapV2Pair.deployed();

    await deploy({
        name: ContractName.MockUniswapV2Factory,
        from: deployer,
        args: [
            ContractName.MockUniswapV2Factory,
            ContractName.MockUniswapV2Factory,
            BigNumber.from(100_000_000),
            uniswapPair.address
        ]
    });

    return true;
};

func.id = DeploymentTag.MockUniswapV2Factory;
func.skip = async () => isMainnet();
func.dependencies = [DeploymentTag.MockUniswapV2Pair];
func.tags = [DeploymentTag.V3, DeploymentTag.MockUniswapV2Factory];

export default func;
