import {
    AccessControlEnumerable,
    AutoCompoundingRewards,
    BNTPool,
    ExternalRewardsVault,
    ProxyAdmin,
    StandardRewards
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
    let standardRewards: StandardRewards;
    let autoCompoundingRewards: AutoCompoundingRewards;
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
        autoCompoundingRewards = await DeployedContracts.AutoCompoundingRewards.deployed();
        standardRewards = await DeployedContracts.StandardRewards.deployed();
    });

    it('should deploy and configure the standard rewards contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(standardRewards.address)).to.equal(proxyAdmin.address);

        expect(await standardRewards.version()).to.equal(1);

        await expectRoleMembers(standardRewards, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet()
                ? [standardRewards.address, bntPool.address, liquidityProtection, stakingRewards]
                : [standardRewards.address, bntPool.address]
        );
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            autoCompoundingRewards.address,
            standardRewards.address
        ]);
    });
});
