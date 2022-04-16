import {
    AccessControlEnumerable,
    AutoCompoundingRewards,
    BancorNetwork,
    BancorNetworkInfo,
    BancorPortal,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolMigrator,
    PoolTokenFactory,
    StandardRewards
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { DeployedContracts, deploymentMetadata, getLatestDeploymentTag, isMainnet } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { performTestDeployment } from '../helpers/Deploy';
import { getNamedAccounts } from 'hardhat';

describe('network', () => {
    let deployer: string;
    let deployerV2: string;
    let foundationMultisig: string;
    let daoMultisig: string;
    let liquidityProtection: string;
    let legacyStakingRewards: string;

    let network: BancorNetwork;
    let bntGovernance: TokenGovernance;
    let vbntGovernance: TokenGovernance;
    let networkSettings: NetworkSettings;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let externalRewardsVault: ExternalRewardsVault;
    let bntPool: BNTPool;
    let pendingWithdrawals: PendingWithdrawals;
    let poolTokenFactory: PoolTokenFactory;
    let poolMigrator: PoolMigrator;
    let poolCollection: PoolCollection;
    let autoCompoundingRewards: AutoCompoundingRewards;
    let standardRewards: StandardRewards;
    let networkInfo: BancorNetworkInfo;
    let bancorPortal: BancorPortal;

    before(async () => {
        ({ deployer, deployerV2, foundationMultisig, daoMultisig, liquidityProtection, legacyStakingRewards } =
            await getNamedAccounts());
    });

    beforeEach(async () => {
        const { tag } = deploymentMetadata(getLatestDeploymentTag());

        await performTestDeployment(tag);

        network = await DeployedContracts.BancorNetwork.deployed();
        bntGovernance = await DeployedContracts.BNTGovernance.deployed();
        vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
        networkSettings = await DeployedContracts.NetworkSettings.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
        poolTokenFactory = await DeployedContracts.PoolTokenFactory.deployed();
        poolMigrator = await DeployedContracts.PoolMigrator.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
        autoCompoundingRewards = await DeployedContracts.AutoCompoundingRewards.deployed();
        standardRewards = await DeployedContracts.StandardRewards.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        bancorPortal = await DeployedContracts.BancorPortal.deployed();
    });

    it('should have the correct set of roles', async () => {
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            isMainnet() ? [deployerV2, deployer] : [deployer]
        );
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet()
                ? [standardRewards.address, bntPool.address, liquidityProtection, legacyStakingRewards]
                : [standardRewards.address, bntPool.address]
        );

        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );
        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            isMainnet() ? [deployerV2, deployer] : [deployer]
        );
        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [bntPool.address, liquidityProtection] : [bntPool.address]
        );

        await expectRoleMembers(masterVault, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
        await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [network.address, poolCollection.address]);

        await expectRoleMembers(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
        await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            network.address,
            poolCollection.address
        ]);

        await expectRoleMembers(externalRewardsVault, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
        await expectRoleMembers(externalRewardsVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            autoCompoundingRewards.address,
            standardRewards.address
        ]);

        await expectRoleMembers(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(networkSettings, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(bntPool, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, [autoCompoundingRewards.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER, [poolCollection.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER, [poolCollection.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER, [poolCollection.address]);

        await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(network, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER);

        await expectRoleMembers(autoCompoundingRewards, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(standardRewards, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(bancorPortal, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
    });
});
