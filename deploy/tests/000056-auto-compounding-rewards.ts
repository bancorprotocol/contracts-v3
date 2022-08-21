import { AutoCompoundingRewards, BNTPool, ExternalRewardsVault, ProxyAdmin } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let proxyAdmin: ProxyAdmin;
    let deployer: string;
    let bntPool: BNTPool;
    let externalRewardsVault: ExternalRewardsVault;
    let autoCompoundingRewards: AutoCompoundingRewards;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        externalRewardsVault = await DeployedContracts.ExternalAutoCompoundingRewardsVault.deployed();
        autoCompoundingRewards = await DeployedContracts.AutoCompoundingRewards.deployed();
    });

    it('should deploy and configure the auto-compounding rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(autoCompoundingRewards.address)).to.equal(proxyAdmin.address);

        expect(await autoCompoundingRewards.version()).to.equal(1);

        await expectRoleMembers(autoCompoundingRewards, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, [autoCompoundingRewards.address]);
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [autoCompoundingRewards.address]);
    });
});
