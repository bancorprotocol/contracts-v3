import { NetworkSettings, PoolCollection } from '../../components/Contracts';
import { DeployedContracts, isMainnet, isMainnetFork, toDeployTag } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment('1642682519-create-native-pool', toDeployTag(__filename), async () => {
    let networkSettings: NetworkSettings;
    let poolCollection: PoolCollection;

    const CENTS = 100;
    const NATIVE_TOKEN_PRICE_IN_CENTS = 2921 * CENTS;
    const BNT_TOKEN_PRICE_IN_CENTS = 2.37 * CENTS;
    const DEPOSIT_LIMIT = toWei(500_000 * CENTS).div(NATIVE_TOKEN_PRICE_IN_CENTS);
    const FUNDING_LIMIT = toWei(500_000 * CENTS).div(BNT_TOKEN_PRICE_IN_CENTS);
    const TRADING_FEE = toPPM(0.2);
    const BNT_VIRTUAL_BALANCE = NATIVE_TOKEN_PRICE_IN_CENTS;
    const NATIVE_TOKEN_VIRTUAL_RATE = BNT_TOKEN_PRICE_IN_CENTS;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(10_000);
    const INITIAL_DEPOSIT = MIN_LIQUIDITY_FOR_TRADING.mul(NATIVE_TOKEN_VIRTUAL_RATE).div(BNT_VIRTUAL_BALANCE).mul(10);

    beforeEach(async () => {
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
    });

    it('should create the native pool', async () => {
        expect(await networkSettings.isTokenWhitelisted(NATIVE_TOKEN_ADDRESS)).to.be.true;
        expect(await networkSettings.poolFundingLimit(NATIVE_TOKEN_ADDRESS)).to.equal(FUNDING_LIMIT);

        const data = await poolCollection.poolData(NATIVE_TOKEN_ADDRESS);
        expect(data.depositLimit).to.equal(DEPOSIT_LIMIT);
        expect(data.tradingFeePPM).to.equal(TRADING_FEE);

        if (!isMainnet() || isMainnetFork()) {
            expect(data.liquidity.stakedBalance).to.equal(INITIAL_DEPOSIT);
            expect(data.liquidity.baseTokenTradingLiquidity).to.equal(
                data.liquidity.bntTradingLiquidity.mul(NATIVE_TOKEN_VIRTUAL_RATE).div(BNT_VIRTUAL_BALANCE)
            );

            expect(data.tradingEnabled).to.be.true;
        }
    });
});
