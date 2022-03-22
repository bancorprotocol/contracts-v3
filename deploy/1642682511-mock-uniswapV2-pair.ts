import { ContractName, deploy, DeploymentTag, isMainnet } from '../utils/Deploy';
import { BigNumber } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    await deploy({
        name: ContractName.MockUniswapV2PairV1,
        from: deployer,
        args: [ContractName.MockUniswapV2PairV1, ContractName.MockUniswapV2PairV1, BigNumber.from(100_000_000)]
    });

    return true;
};

func.id = ContractName.MockUniswapV2PairV1;
func.skip = async () => isMainnet();
func.tags = [DeploymentTag.V3, ContractName.MockUniswapV2PairV1];

export default func;
