import { AsyncReturnType } from '../../components/ContractBuilder';
import { BancorNetwork, PoolCollection, PoolMigrator } from '../../components/Contracts';
import { PoolCollectionType1V4 } from '../../components/LegacyContractsV3';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_TRADING_FEE_PPM, PoolType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

const prevState: Record<string, AsyncReturnType<PoolCollectionType1V4['poolData']>> = {};

const savePreviousPoolData = async () => {
    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V4.deployed();

    const { dai, link } = await getNamedAccounts();

    for (const pool of [NATIVE_TOKEN_ADDRESS, dai, link]) {
        prevState[pool] = await prevPoolCollection.poolData(pool);
    }
};

describeDeployment(
    __filename,
    () => {
        let network: BancorNetwork;
        let poolMigrator: PoolMigrator;
        let newPoolCollection: PoolCollection;

        beforeEach(async () => {
            network = await DeployedContracts.BancorNetwork.deployed();
            poolMigrator = await DeployedContracts.PoolMigrator.deployed();
            newPoolCollection = await DeployedContracts.PoolCollectionType1V5.deployed();
        });

        it('should deploy and migrate the new pool migration and pool collection contracts', async () => {
            expect(await poolMigrator.version()).to.equal(4);

            expect(await newPoolCollection.version()).to.equal(5);

            expect(await newPoolCollection.poolType()).to.equal(PoolType.Standard);
            expect(await newPoolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

            expect(await network.version()).to.equal(6);

            expect(await network.poolCollections()).to.deep.equal([newPoolCollection.address]);

            const { dai, link } = await getNamedAccounts();
            expect(await newPoolCollection.pools()).to.deep.equal([NATIVE_TOKEN_ADDRESS, dai, link]);

            for (const pool of [NATIVE_TOKEN_ADDRESS, dai, link]) {
                expect(await network.collectionByPool(pool)).to.equal(newPoolCollection.address);

                const prevPoolData = prevState[pool];
                const newPoolData = await newPoolCollection.poolData(pool);

                expect(newPoolData.poolToken).to.equal(prevPoolData.poolToken);
                expect(newPoolData.tradingFeePPM).to.equal(prevPoolData.tradingFeePPM);
                expect(newPoolData.tradingEnabled).to.equal(prevPoolData.tradingEnabled);
                expect(newPoolData.depositingEnabled).to.equal(prevPoolData.depositingEnabled);

                expect(newPoolData.averageRates.blockNumber).to.equal(prevPoolData.averageRates.blockNumber);
                expect(newPoolData.averageRates.rate).to.deep.equal(prevPoolData.averageRates.rate);
                expect(newPoolData.averageRates.invRate).to.deep.equal(prevPoolData.averageRates.invRate);

                expect(newPoolData.liquidity).to.deep.equal(prevPoolData.liquidity);
            }
        });
    },
    { beforeDeployments: savePreviousPoolData }
);
