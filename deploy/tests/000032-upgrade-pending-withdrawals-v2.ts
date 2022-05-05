import { PendingWithdrawals } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_LOCK_DURATION } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let pendingWithdrawals: PendingWithdrawals;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    });

    it.only('should upgrade and configure the pending withdrawals contract', async () => {
        expect(await pendingWithdrawals.version()).to.equal(2);

        await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [deployer]);

        expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
    });
});
