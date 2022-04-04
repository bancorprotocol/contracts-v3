import { ContractName, deploy, isMainnet, setDeploymentMetadata } from '../utils/Deploy';
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

setDeploymentMetadata(__filename, func);

func.skip = async () => isMainnet();

export default func;
