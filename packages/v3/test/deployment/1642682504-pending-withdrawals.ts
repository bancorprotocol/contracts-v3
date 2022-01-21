import { PendingWithdrawals, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DEFAULT_LOCK_DURATION, DEFAULT_WITHDRAWAL_WINDOW_DURATION } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682504-pending-withdrawals', () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let pendingWithdrawals: PendingWithdrawals;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.PendingWithdrawals);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    });

    it('should deploy and configure the pending withdrawals contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(pendingWithdrawals.address)).to.equal(proxyAdmin.address);

        expect(await pendingWithdrawals.version()).to.equal(1);

        await expectRole(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer]);

        expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
        expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
    });
});
