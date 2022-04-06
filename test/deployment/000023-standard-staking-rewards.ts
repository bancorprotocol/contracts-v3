import {
    AccessControlEnumerable,
    AutoCompoundingStakingRewards,
    BNTPool,
    ExternalRewardsVault,
    ProxyAdmin,
    StandardStakingRewards
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let proxyAdmin: ProxyAdmin;
    let deployer: string;
    let bntGovernance: TokenGovernance;
    let bntPool: BNTPool;
    let externalRewardsVault: ExternalRewardsVault;
    let standardStakingRewards: StandardStakingRewards;
    let autoCompoundingRewards: AutoCompoundingStakingRewards;
    let liquidityProtection: string;
    let stakingRewards: string;

    before(async () => {
        ({ deployer, liquidityProtection, stakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
        autoCompoundingRewards = await DeployedContracts.AutoCompoundingStakingRewards.deployed();
        standardStakingRewards = await DeployedContracts.StandardStakingRewards.deployed();
    });

    it('should deploy and configure the standard rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(standardStakingRewards.address)).to.equal(proxyAdmin.address);

        expect(await standardStakingRewards.version()).to.equal(1);

        await expectRoleMembers(standardStakingRewards, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet()
                ? [standardStakingRewards.address, bntPool.address, liquidityProtection, stakingRewards]
                : [standardStakingRewards.address, bntPool.address]
        );
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            autoCompoundingRewards.address,
            standardStakingRewards.address
        ]);
    });
});
