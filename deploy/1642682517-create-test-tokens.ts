import { ContractName, deploy, DeploymentTag, isMainnet, isMainnetFork, toDeployTag } from '../utils/Deploy';
import { TokenData, TokenSymbol } from '../utils/TokenData';
import { toWei } from '../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const INITIAL_SUPPLY = toWei(1_000_000_000);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    for (const { symbol, contractName } of [
        { symbol: TokenSymbol.TKN1, contractName: ContractName.TestToken1 },
        { symbol: TokenSymbol.TKN2, contractName: ContractName.TestToken2 },
        { symbol: TokenSymbol.TKN3, contractName: ContractName.TestToken3 }
    ]) {
        const tokenData = new TokenData(symbol);

        await deploy({
            name: contractName,
            contract: 'TestERC20Token',
            args: [tokenData.name(), tokenData.symbol(), INITIAL_SUPPLY],
            from: deployer
        });
    }

    return true;
};

const tag = toDeployTag(__filename);

func.id = tag;
func.skip = async () => isMainnet() && !isMainnetFork();
func.tags = [DeploymentTag.V3, ContractName.TestToken1, ContractName.TestToken2, ContractName.TestToken3, tag];

export default func;
