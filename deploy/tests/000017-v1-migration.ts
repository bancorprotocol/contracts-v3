import { BancorV1Migration } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let migration: BancorV1Migration;

    beforeEach(async () => {
        migration = await DeployedContracts.BancorV1Migration.deployed();
    });

    it('should deploy and configure the V1 migration contract', async () => {
        expect(await migration.version()).to.equal(1);
    });
});
