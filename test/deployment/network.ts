import {
    AccessControlEnumerable,
    AutoCompoundingStakingRewards,
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
    StandardStakingRewards
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { DeployedContracts, isMainnet } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { performTestDeployment } from '../helpers/Deploy';
import { getNamedAccounts } from 'hardhat';

describe('network', () => {
    let deployer: string;
    let foundationMultisig: string;
    let daoMultisig: string;
    let liquidityProtection: string;
    let stakingRewards: string;

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
    let autoCompoundingStakingRewards: AutoCompoundingStakingRewards;
    let standardStakingRewards: StandardStakingRewards;
    let networkInfo: BancorNetworkInfo;
    let bancorPortal: BancorPortal;

    before(async () => {
        ({ deployer, foundationMultisig, daoMultisig, liquidityProtection, stakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await performTestDeployment('000101-transfer-proxy-admin-ownership');

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
        autoCompoundingStakingRewards = await DeployedContracts.AutoCompoundingStakingRewards.deployed();
        standardStakingRewards = await DeployedContracts.StandardStakingRewards.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        bancorPortal = await DeployedContracts.BancorPortal.deployed();
    });

    it('should have the correct set of roles', async () => {
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );
        await expectRoleMembers(bntGovernance as any as AccessControlEnumerable, Roles.TokenGovernance.ROLE_GOVERNOR, [
            deployer
        ]);
        await expectRoleMembers(
            bntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet()
                ? [standardStakingRewards.address, bntPool.address, liquidityProtection, stakingRewards]
                : [standardStakingRewards.address, bntPool.address]
        );

        await expectRoleMembers(
            vbntGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );
        await expectRoleMembers(vbntGovernance as any as AccessControlEnumerable, Roles.TokenGovernance.ROLE_GOVERNOR, [
            deployer
        ]);
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
            autoCompoundingStakingRewards.address,
            standardStakingRewards.address
        ]);

        await expectRoleMembers(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(networkSettings, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(bntPool, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, [
            autoCompoundingStakingRewards.address
        ]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER, [poolCollection.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER, [poolCollection.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER, [poolCollection.address]);

        await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(network, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER);

        await expectRoleMembers(autoCompoundingStakingRewards, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(standardStakingRewards, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(bancorPortal, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
    });
});
