import { Registry as LegacyRegistry, Roles as LegacyRoles } from '../../components/LegacyContracts';
import {
    deploy,
    DeployedContracts,
    execute,
    grantRole,
    InstanceName,
    isLive,
    revokeRole,
    setDeploymentMetadata
} from '../../utils/Deploy';
import Logger from '../../utils/Logger';
import { Roles } from '../../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const legacyLiquidityProtection = await DeployedContracts.LegacyLiquidityProtection5.deployed();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();

    // if we're running on a live production, just ensure that the deployer received the required roles and permissions
    if (isLive()) {
        if ((await legacyLiquidityProtection.owner()) !== deployer) {
            throw new Error('Missing ownership over the current LiquidityProtection contract!');
        }

        if (!(await bntGovernance.hasRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer))) {
            throw new Error('Missing BNT ROLE_GOVERNOR role!');
        }
    }

    const masterVault = await DeployedContracts.MasterVault.deployed();
    const liquidityProtectionSettings = await DeployedContracts.LiquidityProtectionSettings.deployed();
    const liquidityProtectionStore = await DeployedContracts.LiquidityProtectionStore.deployed();
    const liquidityProtectionStats = await DeployedContracts.LiquidityProtectionStats.deployed();
    const liquidityProtectionSystemStore = await DeployedContracts.LiquidityProtectionSystemStore.deployed();
    const liquidityProtectionWallet = await DeployedContracts.LiquidityProtectionWallet.deployed();

    // deploy the new LiquidityProtection contract
    const liquidityProtection = await deploy({
        name: InstanceName.LiquidityProtection,
        args: [
            masterVault.address,
            liquidityProtectionSettings.address,
            liquidityProtectionStore.address,
            liquidityProtectionStats.address,
            liquidityProtectionSystemStore.address,
            liquidityProtectionWallet.address,
            bntGovernance.address,
            vbntGovernance.address
        ],
        from: deployer
    });

    // freeze removals on the legacy contract for the rest of the migration. this has to land before the seed values
    // are read below, so that no removal can make them stale
    await execute({
        name: InstanceName.LegacyLiquidityProtection5,
        methodName: 'enableRemoving',
        args: [false],
        from: deployer
    });

    // seed the per-pool total positions value
    const pools = await liquidityProtectionSettings.poolWhitelist();
    const seeded: [string, string][] = [];
    for (const pool of pools) {
        const value = await legacyLiquidityProtection.totalPositionsValue(pool);
        if (!value.isZero()) {
            seeded.push([pool, value.toString()]);
        }
    }

    Logger.log(`  seeding the total positions value of ${seeded.length}/${pools.length} whitelisted pools`);

    // each entry costs a storage write plus the settings re-validation - roughly 50k gas - so even all of the
    // whitelisted pools together stay well clear of the block gas limit
    await execute({
        name: InstanceName.LiquidityProtection,
        methodName: 'setTotalPositionsValueMultiple',
        args: [seeded.map(([pool]) => pool), seeded.map(([, value]) => value)],
        from: deployer
    });

    // grant the BNT ROLE_MINTER role to the contract.
    await grantRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: liquidityProtection,
        from: deployer
    });

    // grant the LiquidityProtectionStats ROLE_OWNER role to the contract
    await grantRole({
        name: InstanceName.LiquidityProtectionStats,
        id: LegacyRoles.LiquidityProtectionStats.ROLE_OWNER,
        member: liquidityProtection,
        from: deployer
    });

    // grant the LiquidityProtectionSystemStore ROLE_OWNER role to the contract
    await grantRole({
        name: InstanceName.LiquidityProtectionSystemStore,
        id: LegacyRoles.LiquidityProtectionSystemStore.ROLE_OWNER,
        member: liquidityProtection,
        from: deployer
    });

    // transfer the ownership over the LiquidityProtectionStore to the contract
    await execute({
        name: InstanceName.LegacyLiquidityProtection5,
        methodName: 'transferStoreOwnership',
        args: [liquidityProtection],
        from: deployer
    });

    await execute({
        name: InstanceName.LiquidityProtection,
        methodName: 'acceptStoreOwnership',
        from: deployer
    });

    // transfer the ownership over the LiquidityProtectionWallet to the contract
    await execute({
        name: InstanceName.LegacyLiquidityProtection5,
        methodName: 'transferWalletOwnership',
        args: [liquidityProtection],
        from: deployer
    });

    await execute({
        name: InstanceName.LiquidityProtection,
        methodName: 'acceptWalletOwnership',
        from: deployer
    });

    // re-enable removals on the new contract. depositing is deliberately left off - this is a wind-down
    await execute({
        name: InstanceName.LiquidityProtection,
        methodName: 'enableRemoving',
        args: [true],
        from: deployer
    });

    // replace the the contract registry
    await execute({
        name: InstanceName.ContractRegistry,
        methodName: 'registerAddress',
        args: [LegacyRegistry.LIQUIDITY_PROTECTION, liquidityProtection],
        from: deployer
    });

    // revoke the BNT ROLE_MINTER role from the legacy contract
    await revokeRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: legacyLiquidityProtection.address,
        from: deployer
    });

    // revoke the LiquidityProtectionStats ROLE_OWNER from the legacy contract
    await revokeRole({
        name: InstanceName.LiquidityProtectionStats,
        id: LegacyRoles.LiquidityProtectionStats.ROLE_OWNER,
        member: legacyLiquidityProtection.address,
        from: deployer
    });

    // revoke the LiquidityProtectionSystemStore ROLE_OWNER role from the legacy contract
    await revokeRole({
        name: InstanceName.LiquidityProtectionSystemStore,
        id: LegacyRoles.LiquidityProtectionSystemStore.ROLE_OWNER,
        member: legacyLiquidityProtection.address,
        from: deployer
    });

    // revoke the ROLE_MIGRATION_MANAGER role from the legacy contract
    await revokeRole({
        name: InstanceName.BancorNetwork,
        id: Roles.BancorNetwork.ROLE_MIGRATION_MANAGER,
        member: legacyLiquidityProtection.address,
        from: deployer
    });

    return true;
};

export default setDeploymentMetadata(__filename, func);
