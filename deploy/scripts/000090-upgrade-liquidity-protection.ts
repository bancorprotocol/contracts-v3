import LegacyContracts from '../../components/LegacyContracts';
import {
    deploy,
    DeployedContracts,
    fundAccount,
    getNamedSigners,
    InstanceName,
    isLive,
    isMainnetFork,
    setDeploymentMetadata
} from '../../utils/Deploy';
import { Roles } from '../../utils/Roles';
import { utils } from 'ethers';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

const { id } = utils;

const ROLE_PUBLISHER = id('ROLE_PUBLISHER');
const ROLE_OWNER = id('ROLE_OWNER');
const LIQUIDITY_PROTECTION = id('LiquidityProtection');

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    if (!isMainnetFork()) {
        throw new Error('Unsupported network');
    }

    const {
        legacyLiquidityProtection,
        legacyLiquidityProtectionSettings,
        legacyLiquidityProtectionStore,
        legacyLiquidityProtectionStats,
        legacyLiquidityProtectionSystemStore,
        legacyLiquidityProtectionWallet,
        legacyCheckpointStore,
        legacyStakingRewards,
        legacyContractRegistry
    } = await getNamedAccounts();

    const { deployer, deployerV2, foundationMultisig, daoMultisig } = await getNamedSigners();

    await fundAccount(foundationMultisig);
    await fundAccount(daoMultisig);

    const network = await DeployedContracts.BancorNetwork.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const bntGovernance = await DeployedContracts.BNTGovernance.deployed();
    const vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();

    // deploy the new LiquidityProtection contract
    await deploy({
        name: InstanceName.LiquidityProtection,
        args: [
            network.address,
            masterVault.address,
            legacyLiquidityProtectionSettings,
            legacyLiquidityProtectionStore,
            legacyLiquidityProtectionStats,
            legacyLiquidityProtectionSystemStore,
            legacyLiquidityProtectionWallet,
            bntGovernance.address,
            vbntGovernance.address,
            legacyCheckpointStore
        ],
        from: deployer.address
    });

    const liquidityProtection = await DeployedContracts.LiquidityProtection.deployed();

    // transfer the ownership of the LiquidityProtection contract to the foundation
    await liquidityProtection.connect(deployer).transferOwnership(foundationMultisig.address);
    await liquidityProtection.connect(foundationMultisig).acceptOwnership();

    // grant BNT ROLE_MINTER role to the contract
    await bntGovernance.connect(deployerV2).grantRole(Roles.TokenGovernance.ROLE_MINTER, liquidityProtection.address);

    // grant vBNT ROLE_MINTER role to the contract
    await vbntGovernance.connect(deployerV2).grantRole(Roles.TokenGovernance.ROLE_MINTER, liquidityProtection.address);

    // grant the StakingRewards ROLE_PUBLISHER role to the contract
    const stakingRewards = await LegacyContracts.StakingRewards.attach(legacyStakingRewards);
    await stakingRewards.connect(deployerV2).grantRole(ROLE_PUBLISHER, liquidityProtection.address);

    // grant the CheckpointStore ROLE_OWNER role to the contract
    const checkpointStore = await LegacyContracts.CheckpointStore.attach(legacyCheckpointStore);
    await checkpointStore.connect(deployerV2).grantRole(ROLE_OWNER, liquidityProtection.address);

    // grant the LiquidityProtectionStats ROLE_OWNER role to the contract
    const liquidityProtectionStats = await LegacyContracts.LiquidityProtectionStats.attach(
        legacyLiquidityProtectionStats
    );
    await liquidityProtectionStats.connect(deployerV2).grantRole(ROLE_OWNER, liquidityProtection.address);

    // grant the LiquidityProtectionSystemStore ROLE_OWNER role to the contract
    const liquidityProtectionSystemStore = await LegacyContracts.LiquidityProtectionSystemStore.attach(
        legacyLiquidityProtectionSystemStore
    );
    await liquidityProtectionSystemStore.connect(deployerV2).grantRole(ROLE_OWNER, liquidityProtection.address);

    const oldLiquidityProtection = await LegacyContracts.LiquidityProtection.attach(legacyLiquidityProtection);

    // transfer the LiquidityProtectionStore to the contract
    await oldLiquidityProtection.connect(daoMultisig).transferStoreOwnership(liquidityProtection.address);
    await liquidityProtection.connect(foundationMultisig).acceptStoreOwnership();

    // transfer the LiquidityProtectionWallet to the contract
    await oldLiquidityProtection.connect(daoMultisig).transferWalletOwnership(liquidityProtection.address);
    await liquidityProtection.connect(foundationMultisig).acceptWalletOwnership();

    // replace the the contract registry
    const contractRegistry = await LegacyContracts.ContractRegistry.attach(legacyContractRegistry);
    await contractRegistry.connect(deployerV2).registerAddress(LIQUIDITY_PROTECTION, liquidityProtection.address);

    // revoke BNT ROLE_MINTER role from the contract
    await bntGovernance
        .connect(deployerV2)
        .revokeRole(Roles.TokenGovernance.ROLE_MINTER, oldLiquidityProtection.address);

    // revoke vBNT ROLE_MINTER role from the contract
    await vbntGovernance
        .connect(deployerV2)
        .revokeRole(Roles.TokenGovernance.ROLE_MINTER, oldLiquidityProtection.address);

    // revoke the StakingRewards ROLE_PUBLISHER role from the contract
    await stakingRewards.connect(deployerV2).revokeRole(ROLE_PUBLISHER, oldLiquidityProtection.address);

    // revoke the CheckpointStore ROLE_OWNER role from the contract
    await checkpointStore.connect(deployerV2).revokeRole(ROLE_OWNER, oldLiquidityProtection.address);

    // revoke the LiquidityProtectionStats ROLE_OWNER from to the contract
    await liquidityProtectionStats.connect(deployerV2).revokeRole(ROLE_OWNER, oldLiquidityProtection.address);

    // revoke the LiquidityProtectionSystemStore ROLE_OWNER role from the contract
    await liquidityProtectionSystemStore.connect(deployerV2).revokeRole(ROLE_OWNER, oldLiquidityProtection.address);

    // transfer the ownership of the LiquidityProtection contract to the dao
    await liquidityProtection.connect(foundationMultisig).transferOwnership(daoMultisig.address);
    await liquidityProtection.connect(daoMultisig).acceptOwnership();

    return true;
};

func.skip = async () => isLive();

export default setDeploymentMetadata(__filename, func);
