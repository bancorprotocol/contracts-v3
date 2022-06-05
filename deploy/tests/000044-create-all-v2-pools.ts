import { BancorNetworkInfo, NetworkSettings, PoolTokenFactory } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import Logger from '../../utils/Logger';
import { percentsToPPM, toWei } from '../../utils/Types';
import { POOLS, TOKEN_OVERRIDES } from '../scripts/000044-create-all-v2-pools';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let networkInfo: BancorNetworkInfo;
    let networkSetting: NetworkSettings;
    let poolTokenFactory: PoolTokenFactory;

    beforeEach(async () => {
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        networkSetting = await DeployedContracts.NetworkSettings.deployed();
        poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    });

    it('should set all V2 token overrides', async () => {
        for (const { address, symbol, decimals } of TOKEN_OVERRIDES) {
            if (symbol) {
                expect(await poolTokenFactory.tokenSymbolOverride(address)).to.equal(symbol);
            }

            if (decimals) {
                expect(await poolTokenFactory.tokenDecimalsOverride(address)).to.equal(decimals);
            }
        }
    });

    it('should create and whitelist all V2 pools', async () => {
        for (const { symbol, address, fundingLimit, tradingFeePercents } of POOLS) {
            Logger.trace(`Testing ${symbol}...`);

            expect(await networkSetting.isTokenWhitelisted(address)).to.be.true;

            expect(await networkInfo.tradingEnabled(address)).to.be.false;
            expect(await networkSetting.poolFundingLimit(address)).to.equal(toWei(fundingLimit));
            expect(await networkInfo.tradingFeePPM(address)).to.equal(percentsToPPM(tradingFeePercents));
        }
    });
});
