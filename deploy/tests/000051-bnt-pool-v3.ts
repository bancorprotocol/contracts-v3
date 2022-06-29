import { BNTPool } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let bntPool: BNTPool;

    beforeEach(async () => {
        bntPool = await DeployedContracts.BNTPool.deployed();
    });

    it('should upgrade the bnt pool', async () => {
        expect(await bntPool.version()).to.equal(3);
    });
});
