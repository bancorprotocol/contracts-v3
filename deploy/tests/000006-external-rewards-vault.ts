import { ExternalRewardsVault, ProxyAdmin } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let externalRewardsVault: ExternalRewardsVault;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
    });

    it('should deploy and configure the external rewards vault contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(externalRewardsVault.address)).to.equal(proxyAdmin.address);

        expect(await externalRewardsVault.version()).to.equal(1);

        await expectRoleMembers(externalRewardsVault, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER);
    });
});
