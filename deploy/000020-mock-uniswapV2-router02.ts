import { deploy, DeployedContracts, InstanceName, isMainnet, setDeploymentMetadata } from '../utils/Deploy';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const uniswapPair = await DeployedContracts.MockUniswapV2Pair.deployed();

    await deploy({
        name: InstanceName.MockUniswapV2Router02,
        from: deployer,
        args: [
            InstanceName.MockUniswapV2Router02,
            InstanceName.MockUniswapV2Router02,
            BigNumber.from(100_000_000),
            uniswapPair.address
        ]
    });

    return true;
};

func.skip = async () => isMainnet();

export default setDeploymentMetadata(__filename, func);
