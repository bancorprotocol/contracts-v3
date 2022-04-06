import { BancorNetwork } from '../../components/Contracts';
import { PoolType } from '../../utils/Constants';
import { DeployedContracts, InstanceName } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

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

        const pools = [];
        for (const instanceName of [
            InstanceName.TestToken1,
            InstanceName.TestToken2,
            InstanceName.TestToken3,
            InstanceName.TestToken4,
            InstanceName.TestToken5
        ]) {
            pools.push((await DeployedContracts[instanceName].deployed()).address);
        }

        pools.push(NATIVE_TOKEN_ADDRESS);

        expect(await network.liquidityPools()).to.deep.equal(pools);

        for (const pool of pools) {
            expect(await network.collectionByPool(pool)).to.equal(poolCollection.address);
        }
    });
});
