import { PoolType } from '../utils/Constants';
import {
    DeployedContracts,
    execute,
    InstanceName,
    isHardhat,
    isLocalhost,
    save,
    setDeploymentMetadata
} from '../utils/Deploy';
import { DEFAULT_DECIMALS, NATIVE_TOKEN_ADDRESS, TokenSymbol } from '../utils/TokenData';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

enum BetaTokens {
    ETH = 'ETH',
    DAI = 'DAI',
    LINK = 'LINK'
}

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, dai, link } = await getNamedAccounts();

    const BETA_TOKENS = {
        [BetaTokens.ETH]: NATIVE_TOKEN_ADDRESS,
        [BetaTokens.DAI]: dai,
        [BetaTokens.LINK]: link
    };

    const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();

    for (const [symbol, address] of Object.entries(BETA_TOKENS)) {
        const isNativeToken = symbol === BetaTokens.ETH;

        // since we currently aren't using real ERC20 tokens during local unit testing, we'd use the overrides mechanism
        // to ensure that these pools can be created (otherwise, the PoolTokenFactory contract will try to call either
        // symbols() or decimals() and will revert)
        if (!isNativeToken && (isHardhat() || isLocalhost())) {
            await execute({
                name: InstanceName.PoolTokenFactory,
                methodName: 'setTokenSymbolOverride',
                args: [address, TokenSymbol.TKN],
                from: deployer
            });

            await execute({
                name: InstanceName.PoolTokenFactory,
                methodName: 'setTokenDecimalsOverride',
                args: [address, DEFAULT_DECIMALS],
                from: deployer
            });
        }

        await execute({
            name: InstanceName.NetworkSettings,
            methodName: 'addTokenToWhitelist',
            args: [address],
            from: deployer
        });

        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'createPool',
            args: [PoolType.Standard, address],
            from: deployer
        });

        await save({
            name: `bn${symbol}` as InstanceName,
            contract: 'PoolToken',
            address: await poolCollection.poolToken(address)
        });

        await execute({
            name: InstanceName.PoolCollectionType1V1,
            methodName: 'enableDepositing',
            args: [address, false],
            from: deployer
        });
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
