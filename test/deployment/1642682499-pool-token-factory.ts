import { PoolTokenFactory, ProxyAdmin } from '../../components/Contracts';
import { DeployedContracts, DeploymentTag } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682499-pool-token-factory', DeploymentTag.PoolTokenFactoryV1, () => {
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
