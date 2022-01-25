import { PoolTokenFactory, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts, isMainnet, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682499-pool-token-factory', () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let poolTokenFactory: PoolTokenFactory;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.PoolTokenFactoryV1);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        poolTokenFactory = await DeployedContracts.PoolTokenFactoryV1.deployed();
    });

    it('should deploy and configure the pool token factory contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(poolTokenFactory.address)).to.equal(proxyAdmin.address);

        expect(await poolTokenFactory.version()).to.equal(1);

        await expectRole(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
