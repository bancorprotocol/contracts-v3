import { PoolCollection } from '../../components/Contracts';
import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { DeployedContracts, isMainnetFork } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(
    __filename,
    () => {
        let networkSettings: NetworkSettingsV1;
        let poolCollection: PoolCollection;

        // TODO: make sure to update the limits and the rates before running the script in production
        const CENTS = 100;
        const BNT_TOKEN_PRICE_IN_CENTS = 2.7 * CENTS;

        const TRADING_FEE = toPPM(0.2);
        const MIN_LIQUIDITY_FOR_TRADING = toWei(10_000);

        enum BetaTokens {
            ETH = 'ETH',
            DAI = 'DAI',
            LINK = 'LINK'
        }

        const BETA_TOKEN_PRICES_IN_CENTS = {
            [BetaTokens.ETH]: 3266 * CENTS,
            [BetaTokens.DAI]: 1 * CENTS,
            [BetaTokens.LINK]: 15.67 * CENTS
        };

        const TKN_DEPOSIT_LIMIT_IN_CENTS = 171_000 * CENTS;
        const BNT_FUNDING_LIMIT_IN_CENTS = 156_000 * CENTS;
        const FUNDING_LIMIT = toWei(BNT_FUNDING_LIMIT_IN_CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);

        beforeEach(async () => {
            networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
            poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
        });

        it('should create beta pools', async () => {
            const { dai, link } = await getNamedAccounts();

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
                expect(data.depositLimit).to.equal(depositLimit);
                expect(data.tradingFeePPM).to.equal(TRADING_FEE);

                const bntVirtualPrice = tokenPriceInCents;
                const tokenVirtualPrice = BNT_TOKEN_PRICE_IN_CENTS;
                const initialDeposit = MIN_LIQUIDITY_FOR_TRADING.mul(tokenVirtualPrice).div(bntVirtualPrice).mul(3);

                expect(data.liquidity.stakedBalance).to.equal(initialDeposit);
                expect(data.liquidity.baseTokenTradingLiquidity).to.equal(
                    data.liquidity.bntTradingLiquidity.mul(tokenVirtualPrice).div(bntVirtualPrice)
                );

                expect(data.tradingEnabled).to.be.true;
            }
        });
    },
    () => !isMainnetFork()
);
