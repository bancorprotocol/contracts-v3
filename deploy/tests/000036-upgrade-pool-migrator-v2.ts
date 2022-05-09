import { PoolMigrator } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let poolMigrator: PoolMigrator;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        poolMigrator = await DeployedContracts.PoolMigratorV1.deployed();
    });

    it('should  upgrade and configure the pool migrator contract', async () => {
        expect(await poolMigrator.version()).to.equal(2);

        await expectRoleMembers(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
