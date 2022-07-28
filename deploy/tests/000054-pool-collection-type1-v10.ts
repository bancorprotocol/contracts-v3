import { AsyncReturnType } from '../../components/ContractBuilder';
import { BancorNetwork, PoolCollection } from '../../components/Contracts';
import { PoolCollectionType1V9 } from '../../components/LegacyContractsV3';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_TRADING_FEE_PPM, PoolType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

interface State {
    pools: string[];
    data: Record<string, AsyncReturnType<PoolCollectionType1V9['poolData']>>;
}

const prevState: State = { pools: [], data: {} };

const savePreviousPoolData = async () => {
    const network = await DeployedContracts.BancorNetwork.deployed();
    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V9.deployed();

    prevState.pools = await network.liquidityPools();

    for (const pool of prevState.pools) {
        prevState.data[pool] = await prevPoolCollection.poolData(pool);
    }
};

describeDeployment(
    __filename,
    () => {
        let network: BancorNetwork;
        let prevPoolCollection: PoolCollectionType1V9;
        let newPoolCollection: PoolCollection;

        beforeEach(async () => {
            network = await DeployedContracts.BancorNetwork.deployed();
            prevPoolCollection = await DeployedContracts.PoolCollectionType1V9.deployed();
            newPoolCollection = await DeployedContracts.PoolCollectionType1V10.deployed();
        });

        it('should deploy and migrate the new pool migration and pool collection contracts', async () => {
            expect(await newPoolCollection.version()).to.equal(10);

            expect(await newPoolCollection.poolType()).to.equal(PoolType.Standard);
            expect(await newPoolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
            expect(await newPoolCollection.networkFeePPM()).to.equal(await prevPoolCollection.networkFeePPM());
            expect(await newPoolCollection.protectionEnabled()).to.equal(await prevPoolCollection.protectionEnabled());

            expect(await network.poolCollections()).to.deep.equal([newPoolCollection.address]);

            expect(await newPoolCollection.pools()).to.deep.equal(prevState.pools);

            for (const pool of prevState.pools) {
                expect(await network.collectionByPool(pool)).to.equal(newPoolCollection.address);

                const prevPoolData = prevState.data[pool];
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
