import { PoolTokenFactory, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { Roles, expectRoleMembers } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682499-pool-token-factory', ContractName.PoolTokenFactoryV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let poolTokenFactory: PoolTokenFactory;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        poolTokenFactory = await DeployedContracts.PoolTokenFactoryV1.deployed();
    });

    it('should deploy and configure the pool token factory contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(poolTokenFactory.address)).to.equal(proxyAdmin.address);

        expect(await poolTokenFactory.version()).to.equal(1);

        await expectRoleMembers(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
