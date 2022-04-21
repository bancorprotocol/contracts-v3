import { PoolTokenFactory, ProxyAdmin } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let poolTokenFactory: PoolTokenFactory;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    });

    it('should deploy and configure the pool token factory contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(poolTokenFactory.address)).to.equal(proxyAdmin.address);

        expect(await poolTokenFactory.version()).to.equal(1);

        await expectRoleMembers(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
