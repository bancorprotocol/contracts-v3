import { PendingWithdrawals } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_LOCK_DURATION } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let pendingWithdrawals: PendingWithdrawals;

    beforeEach(async () => {
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    });

    it('should deploy and migrate the new pool collection contract and related contracts', async () => {
        expect(await pendingWithdrawals.version()).to.equal(4);
        expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
    });
});
