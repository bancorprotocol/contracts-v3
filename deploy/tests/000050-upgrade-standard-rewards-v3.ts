import { StandardRewards } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let standardRewards: StandardRewards;

    beforeEach(async () => {
        standardRewards = await DeployedContracts.StandardRewards.deployed();
    });

    it('should upgrade the standard rewards contract', async () => {
        expect(await standardRewards.version()).to.equal(4);

        const programIds = await standardRewards.programIds();
        for (const id of programIds) {
            expect(await standardRewards.isProgramPaused(id)).to.be.false;
        }
    });
});
