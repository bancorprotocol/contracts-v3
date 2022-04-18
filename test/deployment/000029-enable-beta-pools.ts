import { PoolCollection } from '../../components/Contracts';
import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { DEFAULT_TRADING_FEE_PPM } from '../../utils/Constants';
import { DeployedContracts, isMainnetFork } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toCents, toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let networkSettings: NetworkSettingsV1;
    let poolCollection: PoolCollection;

    // TODO: make sure to update the limits and the rates before running the script in production
    const BNT_TOKEN_PRICE_IN_CENTS = toCents(2.26);

    enum BetaTokens {
        ETH = 'ETH',
        DAI = 'DAI',
        LINK = 'LINK'
    }

    const BETA_TOKEN_PRICES_IN_CENTS = {
        [BetaTokens.ETH]: toCents(3007),
        [BetaTokens.DAI]: toCents(1),
        [BetaTokens.LINK]: toCents(13.84)
    };

    const TKN_DEPOSIT_LIMIT_IN_CENTS = toCents(171_875);
    const BNT_FUNDING_LIMIT_IN_CENTS = toCents(156_250);
    const FUNDING_LIMIT = toWei(BNT_FUNDING_LIMIT_IN_CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);

    beforeEach(async () => {
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
    });

    it('should create beta pools', async () => {
        const { dai, link } = await getNamedAccounts();

        const minLiquidityForTrading = await networkSettings.minLiquidityForTrading();

        const BETA_TOKENS = {
            [BetaTokens.ETH]: NATIVE_TOKEN_ADDRESS,
            [BetaTokens.DAI]: dai,
            [BetaTokens.LINK]: link
        };

        for (const [tokenSymbol, address] of Object.entries(BETA_TOKENS)) {
            expect(await networkSettings.isTokenWhitelisted(address)).to.be.true;
            expect(await networkSettings.poolFundingLimit(address)).to.equal(FUNDING_LIMIT);

            const tokenPriceInCents = BETA_TOKEN_PRICES_IN_CENTS[tokenSymbol as BetaTokens];
            const depositLimit = toWei(TKN_DEPOSIT_LIMIT_IN_CENTS).div(tokenPriceInCents);

            const data = await poolCollection.poolData(address);
            expect(data.depositingEnabled).to.be.true;
            expect(data.depositLimit).to.equal(depositLimit);
            expect(data.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);

            if (isMainnetFork()) {
                const bntVirtualBalance = tokenPriceInCents;
                const tokenVirtualBalance = BNT_TOKEN_PRICE_IN_CENTS;
                const initialDeposit = minLiquidityForTrading.mul(tokenVirtualBalance).div(bntVirtualBalance).mul(3);

                expect(data.liquidity.stakedBalance).to.equal(initialDeposit);
                expect(data.liquidity.baseTokenTradingLiquidity).to.equal(
                    data.liquidity.bntTradingLiquidity.mul(tokenVirtualBalance).div(bntVirtualBalance)
                );

                expect(data.tradingEnabled).to.be.true;
            }
        }
    });
});
