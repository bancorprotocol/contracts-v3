import { deploy, InstanceName, isMainnet, setDeploymentMetadata } from '../../utils/Deploy';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, weth } = await getNamedAccounts();

    await deploy({
        name: InstanceName.MockUniswapV2Pair,
        from: deployer,
        args: [InstanceName.MockUniswapV2Pair, InstanceName.MockUniswapV2Pair, BigNumber.from(100_000_000), weth]
    });

    return true;
};

func.skip = async () => isMainnet();

export default setDeploymentMetadata(__filename, func);
