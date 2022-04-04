import { MasterVault, ProxyAdmin } from '../../components/Contracts';
import { DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let masterVault: MasterVault;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
    });

    it('should deploy and configure the master vault contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(masterVault.address)).to.equal(proxyAdmin.address);

        expect(await masterVault.version()).to.equal(1);

        await expectRoleMembers(masterVault, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER);
        await expectRoleMembers(masterVault, Roles.MasterVault.ROLE_BNT_MANAGER);
    });
});
