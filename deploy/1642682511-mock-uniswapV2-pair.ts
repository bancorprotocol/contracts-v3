import { ContractName, deploy, DeploymentTag, isMainnet } from '../utils/Deploy';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deploy({
        name: ContractName.MockUniswapV2Pair,
        from: deployer,
        args: [ContractName.MockUniswapV2Pair, ContractName.MockUniswapV2Pair, BigNumber.from(100_000_000)]
    });

    return true;
};

func.id = DeploymentTag.MockUniswapV2Pair;
func.skip = async () => isMainnet();
func.tags = [DeploymentTag.V3, DeploymentTag.MockUniswapV2Pair];

export default func;
