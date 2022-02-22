import { PoolCollectionUpgrader, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682505-pool-collection-upgrader', ContractName.PoolCollectionUpgraderV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let poolCollectionUpgrader: PoolCollectionUpgrader;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgraderV1.deployed();
    });

    it('should deploy and configure the pool collection upgrader contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(poolCollectionUpgrader.address)).to.equal(proxyAdmin.address);

        expect(await poolCollectionUpgrader.version()).to.equal(1);

        await expectRoleMembers(poolCollectionUpgrader, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
