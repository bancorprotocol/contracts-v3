import { PoolMigrator } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let poolMigrator: PoolMigrator;

    beforeEach(async () => {
        poolMigrator = await DeployedContracts.PoolMigrator.deployed();
    });

    it('should deploy and upgrade the pool migrator contract', async () => {
        expect(await poolMigrator.version()).to.equal(5);
    });
});
