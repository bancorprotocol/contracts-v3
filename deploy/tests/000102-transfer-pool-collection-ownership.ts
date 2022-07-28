import { PoolCollection } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isLive } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(
    __filename,
    () => {
        let daoMultisig: string;
        let poolCollection: PoolCollection;

        before(async () => {
            ({ daoMultisig } = await getNamedAccounts());
        });

        beforeEach(async () => {
            poolCollection = await DeployedContracts.PoolCollectionType1V10.deployed();
        });

        it('should transfer the ownership of the pool collection contract', async () => {
            expect(await poolCollection.owner()).to.equal(daoMultisig);
        });
    },
    { skip: isLive }
);
