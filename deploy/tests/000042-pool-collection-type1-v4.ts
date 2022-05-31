import { AsyncReturnType } from '../../components/ContractBuilder';
import { PoolCollection } from '../../components/Contracts';
import { BancorNetworkV5, PoolCollectionType1V3, PoolMigratorV3 } from '../../components/LegacyContractsV3';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_TRADING_FEE_PPM, PoolType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

const prevState: Record<string, AsyncReturnType<PoolCollectionType1V3['poolData']>> = {};

const savePreviousPoolData = async () => {
    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V3.deployed();

    const { dai, link } = await getNamedAccounts();

    for (const pool of [NATIVE_TOKEN_ADDRESS, dai, link]) {
        prevState[pool] = await prevPoolCollection.poolData(pool);
    }
};

describeDeployment(
    __filename,
    () => {
        let network: BancorNetworkV5;
        let poolMigrator: PoolMigratorV3;
        let prevPoolCollection: PoolCollectionType1V3;
        let newPoolCollection: PoolCollection;

        beforeEach(async () => {
            network = await DeployedContracts.BancorNetworkV5.deployed();
            poolMigrator = await DeployedContracts.PoolMigratorV3.deployed();
            prevPoolCollection = await DeployedContracts.PoolCollectionType1V3.deployed();
            newPoolCollection = await DeployedContracts.PoolCollectionType1V4.deployed();
        });

        it('should deploy and migrate the new pool migration and pool collection contracts', async () => {
            expect(await poolMigrator.version()).to.equal(3);

            expect(await newPoolCollection.version()).to.equal(4);

            expect(await newPoolCollection.poolType()).to.equal(PoolType.Standard);
            expect(await newPoolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

            expect(await network.latestPoolCollection(PoolType.Standard)).to.equal(newPoolCollection.address);
            expect(await network.poolCollections()).not.to.include(prevPoolCollection.address);

            const { dai, link } = await getNamedAccounts();
            expect(await newPoolCollection.pools()).to.deep.equal([NATIVE_TOKEN_ADDRESS, dai, link]);

            for (const pool of [NATIVE_TOKEN_ADDRESS, dai, link]) {
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
