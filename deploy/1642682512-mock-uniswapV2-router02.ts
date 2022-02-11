import { deploy, ContractName, DeploymentTag, DeployedContracts } from '../utils/Deploy';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const uniswapPair = await DeployedContracts.MockUniswapV2PairV1.deployed();

    await deploy({
        name: ContractName.MockUniswapV2Router02V1,
        from: deployer,
        args: [
            ContractName.MockUniswapV2Router02V1,
            ContractName.MockUniswapV2Router02V1,
            BigNumber.from(100_000_000),
            uniswapPair.address
        ]
    });

    return true;
};

func.id = ContractName.MockUniswapV2Router02V1;
// func.dependencies = [DeploymentTag.V3, ContractName.MockUniswapV2PairV1];
// func.tags = [DeploymentTag.V3, ContractName.MockUniswapV2Router02V1];

export default func;
