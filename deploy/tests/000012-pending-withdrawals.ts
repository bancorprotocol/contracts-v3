import { ProxyAdmin } from '../../components/Contracts';
import { PendingWithdrawalsV1 } from '../../components/LegacyContractsV3';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_LOCK_DURATION } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let pendingWithdrawals: PendingWithdrawalsV1;

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
