import { BancorPortal } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let bancorPortal: BancorPortal;

    beforeEach(async () => {
        bancorPortal = await DeployedContracts.BancorPortal.deployed();
    });

    it('should upgrade the bancor portal contract', async () => {
        expect(await bancorPortal.version()).to.equal(3);
    });
});
