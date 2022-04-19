import { ExternalProtectionVault, ProxyAdmin } from '../../components/Contracts';
import { DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let externalProtectionVault: ExternalProtectionVault;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    });

    it('should deploy and configure the external protection vault contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(externalProtectionVault.address)).to.equal(proxyAdmin.address);

        expect(await externalProtectionVault.version()).to.equal(1);

        await expectRoleMembers(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER);
    });
});
