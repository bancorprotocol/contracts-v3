import { PoolMigrator, ProxyAdmin } from '../../components/Contracts';
import { DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let poolMigrator: PoolMigrator;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        poolMigrator = await DeployedContracts.PoolMigrator.deployed();
    });

    it('should deploy and configure the pool migrator contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(poolMigrator.address)).to.equal(proxyAdmin.address);

        expect(await poolMigrator.version()).to.equal(1);

        await expectRoleMembers(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
