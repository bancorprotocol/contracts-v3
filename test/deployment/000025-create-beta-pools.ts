import { PoolCollection } from '../../components/Contracts';
import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { DEFAULT_TRADING_FEE_PPM } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let networkSettings: NetworkSettingsV1;
    let poolCollection: PoolCollection;

    enum BetaTokens {
        ETH = 'ETH',
        DAI = 'DAI',
        LINK = 'LINK'
    }

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

        for (const [, address] of Object.entries(BETA_TOKENS)) {
            expect(await networkSettings.isTokenWhitelisted(address)).to.be.true;
            expect(await networkSettings.poolFundingLimit(address)).to.equal(0);

            const data = await poolCollection.poolData(address);
            expect(data.depositingEnabled).to.be.false;
            expect(data.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);
            expect(data.depositLimit).to.equal(0);
        }
    });
});
