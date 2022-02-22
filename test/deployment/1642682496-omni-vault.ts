import { OmniVault, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682496-omni-vault', ContractName.OmniVaultV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let omniVault: OmniVault;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        omniVault = await DeployedContracts.OmniVaultV1.deployed();
    });

    it('should deploy and configure the omni vault contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(omniVault.address)).to.equal(proxyAdmin.address);

        expect(await omniVault.version()).to.equal(1);

        await expectRoleMembers(omniVault, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(omniVault, Roles.Vault.ROLE_ASSET_MANAGER);
        await expectRoleMembers(omniVault, Roles.OmniVault.ROLE_BNT_MANAGER);
    });
});
