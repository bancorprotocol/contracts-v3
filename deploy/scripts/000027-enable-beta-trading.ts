import { execute, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toCents, toWei } from '../../utils/Types';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const BNT_TOKEN_PRICE_IN_CENTS = toCents(2.29);

enum BetaTokens {
    ETH = 'ETH',
    DAI = 'DAI',
    LINK = 'LINK'
}

const BETA_TOKEN_PRICES_IN_CENTS = {
    [BetaTokens.ETH]: toCents(3082),
    [BetaTokens.DAI]: toCents(1),
    [BetaTokens.LINK]: toCents(13.92)
};

const BNT_FUNDING_LIMIT_IN_CENTS = toCents(156_250);
const FUNDING_LIMIT = toWei(BNT_FUNDING_LIMIT_IN_CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer, dai, link } = await getNamedAccounts();

    const BETA_TOKENS = {
        [BetaTokens.ETH]: NATIVE_TOKEN_ADDRESS,
        [BetaTokens.DAI]: dai,
        [BetaTokens.LINK]: link
    };

    for (const [tokenSymbol, address] of Object.entries(BETA_TOKENS)) {
        await execute({
            name: InstanceName.NetworkSettings,
            methodName: 'setFundingLimit',
            args: [address, FUNDING_LIMIT],
            from: deployer
        });

        const tokenPriceInCents = BETA_TOKEN_PRICES_IN_CENTS[tokenSymbol as BetaTokens];
        const bntVirtualBalance = tokenPriceInCents;
        const tokenVirtualBalance = BNT_TOKEN_PRICE_IN_CENTS;

        await execute({
            name: InstanceName.PoolCollectionType1V1,
            methodName: 'enableTrading',
            args: [address, bntVirtualBalance, tokenVirtualBalance],
            from: deployer
        });
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
