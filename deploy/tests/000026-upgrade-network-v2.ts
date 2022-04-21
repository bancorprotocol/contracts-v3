import { BancorNetwork } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { PoolType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let network: BancorNetwork;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetwork.deployed();
    });

    it('should upgrade and configure the network contract', async () => {
        expect(await network.version()).to.equal(2);

        const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();

        expect(await network.poolCollections()).to.include(poolCollection.address);
        expect(await network.latestPoolCollection(PoolType.Standard)).to.equal(poolCollection.address);

        const { dai, link } = await getNamedAccounts();

        const pools = [NATIVE_TOKEN_ADDRESS, dai, link];

        expect(await network.liquidityPools()).to.deep.equal(pools);

        for (const pool of pools) {
            expect(await network.collectionByPool(pool)).to.equal(poolCollection.address);
        }
    });
});
