import { AccessControlEnumerable, BNTPool, ExternalRewardsVault, ProxyAdmin } from '../../components/Contracts';
import { LiquidityProtection, StakingRewards, TokenGovernance } from '../../components/LegacyContracts';
import { StandardRewardsV1 } from '../../components/LegacyContractsV3';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let proxyAdmin: ProxyAdmin;
    let deployer: string;
    let bntGovernance: TokenGovernance;
    let bntPool: BNTPool;
    let externalRewardsVault: ExternalRewardsVault;
    let standardRewards: StandardRewardsV1;
    let legacyLiquidityProtection: LiquidityProtection;
    let legacyStakingRewards: StakingRewards;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
        standardRewards = await DeployedContracts.StandardRewardsV1.deployed();
        legacyLiquidityProtection = await DeployedContracts.LegacyLiquidityProtection.deployed();
        legacyStakingRewards = await DeployedContracts.StakingRewards.deployed();
    });

    it('should deploy and configure the standard rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(standardRewards.address)).to.equal(proxyAdmin.address);

        expect(await standardRewards.version()).to.equal(1);

        await expectRoleMembers(standardRewards, Roles.Upgradeable.ROLE_ADMIN, [deployer]);

        const expectedRoles = [standardRewards.address, bntPool.address];
        if (isMainnet()) {
            expectedRoles.push(legacyLiquidityProtection.address, legacyStakingRewards.address);
        }

        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            expectedRoles
        );
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [standardRewards.address]);
    });
});
