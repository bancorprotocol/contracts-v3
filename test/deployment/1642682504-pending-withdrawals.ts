import { PendingWithdrawals, ProxyAdmin } from '../../components/Contracts';
import { DEFAULT_LOCK_DURATION } from '../../utils/Constants';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { Roles, expectRoleMembers } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682504-pending-withdrawals', ContractName.PendingWithdrawalsV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let pendingWithdrawals: PendingWithdrawals;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawalsV1.deployed();
    });

    it('should deploy and configure the pending withdrawals contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(pendingWithdrawals.address)).to.equal(proxyAdmin.address);

        expect(await pendingWithdrawals.version()).to.equal(1);

        await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [deployer]);

        expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
    });
});
