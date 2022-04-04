import { ContractInstance, deploy, isMainnet, setDeploymentMetadata } from '../utils/Deploy';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deploy({
        name: ContractInstance.MockUniswapV2Pair,
        from: deployer,
        args: [ContractInstance.MockUniswapV2Pair, ContractInstance.MockUniswapV2Pair, BigNumber.from(100_000_000)]
    });

    return true;
};

func.skip = async () => isMainnet();

export default setDeploymentMetadata(__filename, func);
