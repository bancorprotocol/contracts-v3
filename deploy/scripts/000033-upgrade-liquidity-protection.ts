import { Registry as LegacyRegistry, Roles as LegacyRoles } from '../../components/LegacyContracts';
import {
    deploy,
    DeployedContracts,
    execute,
    fundAccount,
    getNamedSigners,
    grantRole,
    InstanceName,
    isLive,
    isMainnet,
    isMainnetFork,
    revokeRole,
    setDeploymentMetadata
} from '../../utils/Deploy';
import { Roles } from '../../utils/Roles';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const legacyLiquidityProtection = await DeployedContracts.LegacyLiquidityProtection.deployed();

    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
    const checkpointStore = await DeployedContracts.CheckpointStore.deployed();
    const liquidityProtectionStats = await DeployedContracts.LiquidityProtectionStats.deployed();
    const liquidityProtectionSystemStore = await DeployedContracts.LiquidityProtectionSystemStore.deployed();

    // if we're running on a live production, just ensure that the deployer received the required roles and permissions
    if (isLive()) {
        if ((await legacyLiquidityProtection.owner()) !== deployer) {
            throw new Error('Missing ownership over the current LiquidityProtection contract!');
        }

        if (!(await bntGovernance.hasRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer))) {
            throw new Error('Missing BNT ROLE_GOVERNOR role!');
        }

        if (!(await vbntGovernance.hasRole(Roles.TokenGovernance.ROLE_GOVERNOR, deployer))) {
            throw new Error('Missing vBNT ROLE_GOVERNOR role!');
        }

        return true;
    }

    // simulate all the required roles and permissions on a mainnet fork
    if (isMainnetFork()) {
        const { daoMultisig, foundationMultisig, deployer: deployerSigner } = await getNamedSigners();

        await fundAccount(daoMultisig);
        await fundAccount(foundationMultisig);

        await legacyLiquidityProtection.connect(daoMultisig).transferOwnership(deployer);
        await legacyLiquidityProtection.connect(deployerSigner).acceptOwnership();

        await grantRole({
            name: InstanceName.BNTGovernance,
            id: Roles.TokenGovernance.ROLE_GOVERNOR,
            member: deployer,
            from: foundationMultisig.address
        });

        await grantRole({
            name: InstanceName.VBNTGovernance,
            id: Roles.TokenGovernance.ROLE_GOVERNOR,
            member: deployer,
            from: foundationMultisig.address
        });
    }

    const network = await DeployedContracts.BancorNetwork.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const liquidityProtectionSettings = await DeployedContracts.LiquidityProtectionSettings.deployed();
    const liquidityProtectionStore = await DeployedContracts.LiquidityProtectionStore.deployed();
    const liquidityProtectionWallet = await DeployedContracts.LiquidityProtectionWallet.deployed();

    // deploy the new LiquidityProtection contract
    const liquidityProtection = await deploy({
        name: InstanceName.LiquidityProtection,
        args: [
            network.address,
            masterVault.address,
            liquidityProtectionSettings.address,
            liquidityProtectionStore.address,
            liquidityProtectionStats.address,
            liquidityProtectionSystemStore.address,
            liquidityProtectionWallet.address,
            bntGovernance.address,
            vbntGovernance.address,
            checkpointStore.address
        ],
        from: deployer
    });

    // grant the BNT ROLE_MINTER role to the contract
    await grantRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: liquidityProtection,
        from: deployer
    });

    // grant the vBNT ROLE_MINTER role to the contract
    await grantRole({
        name: InstanceName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: liquidityProtection,
        from: deployer
    });

    // grant the StakingRewards ROLE_PUBLISHER role to the contract
    await grantRole({
        name: InstanceName.StakingRewards,
        id: LegacyRoles.StakingRewards.ROLE_PUBLISHER,
        member: liquidityProtection,
        from: deployer
    });

    // grant the CheckpointStore ROLE_OWNER role to the contract
    await grantRole({
        name: InstanceName.CheckpointStore,
        id: LegacyRoles.CheckpointStore.ROLE_OWNER,
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
        name: InstanceName.LegacyLiquidityProtection,
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
        name: InstanceName.LegacyLiquidityProtection,
        methodName: 'transferWalletOwnership',
        args: [liquidityProtection],
        from: deployer
    });

    await execute({
        name: InstanceName.LiquidityProtection,
        methodName: 'acceptWalletOwnership',
        from: deployer
    });

    // revoke the BNT ROLE_MINTER role from the legacy contract
    await revokeRole({
        name: InstanceName.BNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: legacyLiquidityProtection.address,
        from: deployer
    });

    // revoke the vBNT ROLE_MINTER role from the legacy contract
    await revokeRole({
        name: InstanceName.VBNTGovernance,
        id: Roles.TokenGovernance.ROLE_MINTER,
        member: legacyLiquidityProtection.address,
        from: deployer
    });

    // revoke the StakingRewards ROLE_PUBLISHER role from the legacy contract
    await revokeRole({
        name: InstanceName.StakingRewards,
        id: LegacyRoles.StakingRewards.ROLE_PUBLISHER,
        member: legacyLiquidityProtection.address,
        from: deployer
    });

    // revoke the CheckpointStore ROLE_OWNER role from the legacy contract
    await revokeRole({
        name: InstanceName.CheckpointStore,
        id: LegacyRoles.CheckpointStore.ROLE_OWNER,
        member: legacyLiquidityProtection.address,
        from: deployer
    });

    // revoke the LiquidityProtectionStats ROLE_OWNER from to the legacy contract
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

    // replace the the contract registry
    await execute({
        name: InstanceName.ContractRegistry,
        methodName: 'registerAddress',
        args: [LegacyRegistry.LIQUIDITY_PROTECTION, liquidityProtection],
        from: deployer
    });

    return true;
};

func.skip = async () => !isMainnet();

export default setDeploymentMetadata(__filename, func);
