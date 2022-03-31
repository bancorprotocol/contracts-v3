import { BancorNetwork } from '../../components/Contracts';
import { PoolType } from '../../utils/Constants';
import { ContractName, DeployedContracts, DeploymentTag } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment('1642682520-upgrade-network-v2', DeploymentTag.BancorNetworkV2, () => {
    let network: BancorNetwork;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetwork.deployed();
    });

    it.only('should upgrade and configure the network contract', async () => {
        expect(await network.version()).to.equal(2);

        const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();

        expect(await network.poolCollections()).to.include(poolCollection.address);
        expect(await network.latestPoolCollection(PoolType.Standard)).to.equal(poolCollection.address);

        const pools = [NATIVE_TOKEN_ADDRESS];
        for (const contractName of [
            ContractName.TestToken1,
            ContractName.TestToken2,
            ContractName.TestToken3,
            ContractName.TestToken4,
            ContractName.TestToken5
        ]) {
            pools.push((await DeployedContracts[contractName].deployed()).address);
        }

        expect(await network.liquidityPools()).to.have.members(pools);

        for (const pool of pools) {
            expect(await network.collectionByPool(pool)).to.equal(poolCollection.address);
        }
    });
});
