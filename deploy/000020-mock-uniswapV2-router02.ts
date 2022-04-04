import { ContractName, deploy, DeployedContracts, isMainnet, setDeploymentMetadata } from '../utils/Deploy';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const uniswapPair = await DeployedContracts.MockUniswapV2Pair.deployed();

    await deploy({
        name: ContractName.MockUniswapV2Router02,
        from: deployer,
        args: [
            ContractName.MockUniswapV2Router02,
            ContractName.MockUniswapV2Router02,
            BigNumber.from(100_000_000),
            uniswapPair.address
        ]
    });

    return true;
};

setDeploymentMetadata(__filename, func);

func.skip = async () => isMainnet();

export default func;
