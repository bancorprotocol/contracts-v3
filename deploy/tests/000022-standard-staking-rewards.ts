import { AccessControlEnumerable, BNTPool, ExternalRewardsVault, ProxyAdmin } from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
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
    let legacyLiquidityProtection: string;
    let legacyStakingRewards: string;

    before(async () => {
        ({ deployer, legacyLiquidityProtection, legacyStakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
        standardRewards = await DeployedContracts.StandardRewardsV1.deployed();
    });

    it('should deploy and configure the standard rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(standardRewards.address)).to.equal(proxyAdmin.address);

        expect(await standardRewards.version()).to.equal(1);

        await expectRoleMembers(standardRewards, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet()
                ? [standardRewards.address, bntPool.address, legacyLiquidityProtection, legacyStakingRewards]
                : [standardRewards.address, bntPool.address]
        );
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [standardRewards.address]);
    });
});
