import {
    AccessControlEnumerable,
    AutoCompoundingStakingRewards,
    BancorNetwork,
    BancorNetworkInfo,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterPool,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolCollectionUpgrader,
    PoolTokenFactory
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { DeployedContracts, DeploymentTag, isMainnet, runTestDeployment } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { getNamedAccounts } from 'hardhat';

describe('network', () => {
    let deployer: string;
    let foundationMultisig: string;
    let daoMultisig: string;
    let liquidityProtection: string;
    let stakingRewards: string;

    let network: BancorNetwork;
    let networkTokenGovernance: TokenGovernance;
    let govTokenGovernance: TokenGovernance;
    let networkSettings: NetworkSettings;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let externalRewardsVault: ExternalRewardsVault;
    let masterPool: MasterPool;
    let pendingWithdrawals: PendingWithdrawals;
    let poolTokenFactory: PoolTokenFactory;
    let poolCollectionUpgrader: PoolCollectionUpgrader;
    let poolCollection: PoolCollection;
    let autoCompoundingStakingRewards: AutoCompoundingStakingRewards;
    let networkInfo: BancorNetworkInfo;

    before(async () => {
        ({ deployer, foundationMultisig, daoMultisig, liquidityProtection, stakingRewards } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(DeploymentTag.V3);

        network = await DeployedContracts.BancorNetworkV1.deployed();
        networkTokenGovernance = await DeployedContracts.NetworkTokenGovernance.deployed();
        govTokenGovernance = await DeployedContracts.GovTokenGovernance.deployed();
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
        masterVault = await DeployedContracts.MasterVaultV1.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVaultV1.deployed();
        externalRewardsVault = await DeployedContracts.ExternalRewardsVaultV1.deployed();
        masterPool = await DeployedContracts.MasterPoolV1.deployed();
        pendingWithdrawals = await DeployedContracts.PendingWithdrawalsV1.deployed();
        poolTokenFactory = await DeployedContracts.PoolTokenFactoryV1.deployed();
        poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgraderV1.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
        autoCompoundingStakingRewards = await DeployedContracts.AutoCompoundingStakingRewardsV1.deployed();
        networkInfo = await DeployedContracts.BancorNetworkInfoV1.deployed();
    });

    it('should have the correct set of roles', async () => {
        await expectRoleMembers(
            networkTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );
        await expectRoleMembers(
            networkTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            [deployer]
        );
        await expectRoleMembers(
            networkTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [liquidityProtection, stakingRewards] : []
        );

        await expectRoleMembers(
            govTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_SUPERVISOR,
            [foundationMultisig]
        );
        await expectRoleMembers(
            govTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_GOVERNOR,
            [deployer]
        );
        await expectRoleMembers(
            govTokenGovernance as any as AccessControlEnumerable,
            Roles.TokenGovernance.ROLE_MINTER,
            isMainnet() ? [liquidityProtection] : []
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
            autoCompoundingStakingRewards.address
        ]);

        await expectRoleMembers(poolTokenFactory, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(networkSettings, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(masterPool, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig, network.address]);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, [
            autoCompoundingStakingRewards.address
        ]);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_NETWORK_TOKEN_MANAGER, [poolCollection.address]);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_VAULT_MANAGER, [poolCollection.address]);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_FUNDING_MANAGER, [poolCollection.address]);

        await expectRoleMembers(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(poolCollectionUpgrader, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(network, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER);

        await expectRoleMembers(autoCompoundingStakingRewards, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);

        await expectRoleMembers(networkInfo, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
    });
});
