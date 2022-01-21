import { PoolTokenFactory, ProxyAdmin } from '../../components/Contracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682499-pool-token-factory', () => {
    let daoMultisig: string;
    let proxyAdmin: ProxyAdmin;
    let poolTokenFactory: PoolTokenFactory;

    before(async () => {
        ({ daoMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.PoolTokenFactory);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
    });

    it('should deploy and configure the pool token factory contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(poolTokenFactory.address)).to.equal(proxyAdmin.address);

        expect(await poolTokenFactory.version()).to.equal(1);

        await expectRole(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
    });
});
