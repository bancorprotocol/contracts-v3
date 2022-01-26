import { PoolCollectionUpgrader, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682505-pool-collection-upgrader', () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let poolCollectionUpgrader: PoolCollectionUpgrader;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.PoolCollectionUpgraderV1);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgraderV1.deployed();
    });

    it('should deploy and configure the pool collection upgrader contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(poolCollectionUpgrader.address)).to.equal(proxyAdmin.address);

        expect(await poolCollectionUpgrader.version()).to.equal(1);

        await expectRole(poolCollectionUpgrader, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
            deployer
        ]);
    });
});
