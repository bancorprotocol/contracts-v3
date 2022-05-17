import { BancorNetwork, BNTPool, PendingWithdrawals } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_LOCK_DURATION } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;

    let network: BancorNetwork;
    let pendingWithdrawals: PendingWithdrawals;
    let bntPool: BNTPool;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetwork.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
    });

    it('should upgrade and configure the contracts', async () => {
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, [deployer]);

        expect(await network.version()).to.equal(4);
        expect(await pendingWithdrawals.version()).to.equal(3);
        expect(await bntPool.version()).to.equal(2);

        await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [deployer]);

        expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
    });
});
