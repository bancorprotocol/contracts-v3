import { NetworkSettings, PoolCollection, TestERC20Token } from '../../components/Contracts';
import { ContractName, DeployedContracts, isMainnet, toDeployTag } from '../../utils/Deploy';
import { toPPM, toWei } from '../../utils/Types';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment('1642682518-create-test-pools', toDeployTag(__filename), async () => {
    let networkSettings: NetworkSettings;
    let poolCollection: PoolCollection;

    let testTokens: TestERC20Token[];

    const DEPOSIT_LIMIT = toWei(1_000_000);
    const FUNDING_LIMIT = toWei(10_000_000);
    const INITIAL_DEPOSIT = toWei(500_000);
    const TRADING_FEE = toPPM(0.2);
    const BNT_FUNDING_RATE = 1;
    const BASE_TOKEN_FUNDING_RATE = 2;

    beforeEach(async () => {
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();

        testTokens = [];

        for (const contractName of [ContractName.TestToken1, ContractName.TestToken2, ContractName.TestToken3]) {
            testTokens.push(await DeployedContracts[contractName].deployed());
        }
    });

    if (!isMainnet()) {
        it('should create all test pools', async () => {
            for (const testToken of testTokens) {
                expect(await networkSettings.isTokenWhitelisted(testToken.address)).to.be.true;
                expect(await networkSettings.poolFundingLimit(testToken.address)).to.equal(FUNDING_LIMIT);

                const data = await poolCollection.poolData(testToken.address);
                expect(data.depositLimit).to.equal(DEPOSIT_LIMIT);
                expect(data.tradingFeePPM).to.equal(TRADING_FEE);
                expect(data.liquidity.stakedBalance).to.equal(INITIAL_DEPOSIT);
                expect(data.liquidity.baseTokenTradingLiquidity).to.equal(
                    data.liquidity.bntTradingLiquidity.mul(BASE_TOKEN_FUNDING_RATE).div(BNT_FUNDING_RATE)
                );

                expect(data.tradingEnabled).to.be.true;
            }
        });
    }
});
