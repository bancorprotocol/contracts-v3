import LegacyContracts from '../../components/LegacyContracts';
import { ethers } from 'hardhat';

const {
    registry: { CONVERTER_FACTORY, CONVERTER_REGISTRY, CONVERTER_REGISTRY_DATA, BANCOR_NETWORK, NETWORK_SETTINGS },
    roles: { ROLE_OWNER }
} = require('../../../v2/test/helpers/Constants');

export const createLegacySystem = async (
    owner: any,
    network: any,
    networkToken: any,
    networkTokenGovernance: any,
    govTokenGovernance: any
) => {
    const contractRegistry = await LegacyContracts.ContractRegistry.deploy();
    const converterRegistry = await LegacyContracts.ConverterRegistry.deploy(contractRegistry.address);
    const converterRegistryData = await LegacyContracts.ConverterRegistryData.deploy(contractRegistry.address);
    const legacyNetwork = await LegacyContracts.LegacyBancorNetwork.deploy(contractRegistry.address);
    const legacyNetworkSettings = await LegacyContracts.LegacyNetworkSettings.deploy(owner.address, 0);
    const standardPoolConverterFactory = await LegacyContracts.TestStandardPoolConverterFactory.deploy();
    const converterFactory = await LegacyContracts.ConverterFactory.deploy();

    await converterFactory.registerTypedConverterFactory(standardPoolConverterFactory.address);

    await contractRegistry.registerAddress(CONVERTER_FACTORY, converterFactory.address);
    await contractRegistry.registerAddress(CONVERTER_REGISTRY, converterRegistry.address);
    await contractRegistry.registerAddress(CONVERTER_REGISTRY_DATA, converterRegistryData.address);
    await contractRegistry.registerAddress(BANCOR_NETWORK, legacyNetwork.address);
    await contractRegistry.registerAddress(NETWORK_SETTINGS, legacyNetworkSettings.address);

    const checkpointStore = await LegacyContracts.TestCheckpointStore.deploy();
    const liquidityProtectionStore = await LegacyContracts.LiquidityProtectionStore.deploy();
    const liquidityProtectionStats = await LegacyContracts.LiquidityProtectionStats.deploy();
    const liquidityProtectionSystemStore = await LegacyContracts.LiquidityProtectionSystemStore.deploy();
    const liquidityProtectionWallet = await LegacyContracts.LegacyTokenHolder.deploy();
    const liquidityProtectionSettings = await LegacyContracts.LiquidityProtectionSettings.deploy(
        networkToken.address,
        contractRegistry.address
    );
    const liquidityProtection = await LegacyContracts.TestLiquidityProtection.deploy(
        network.address,
        liquidityProtectionSettings.address,
        liquidityProtectionStore.address,
        liquidityProtectionStats.address,
        liquidityProtectionSystemStore.address,
        liquidityProtectionWallet.address,
        networkTokenGovernance.address,
        govTokenGovernance.address,
        checkpointStore.address
    );

    await checkpointStore.grantRole(ROLE_OWNER, liquidityProtection.address);
    await liquidityProtectionSettings.grantRole(ROLE_OWNER, liquidityProtection.address);
    await liquidityProtectionStats.grantRole(ROLE_OWNER, liquidityProtection.address);
    await liquidityProtectionSystemStore.grantRole(ROLE_OWNER, liquidityProtection.address);
    await liquidityProtectionStore.transferOwnership(liquidityProtection.address);
    await liquidityProtection.acceptStoreOwnership();
    await liquidityProtectionWallet.transferOwnership(liquidityProtection.address);
    await liquidityProtection.acceptWalletOwnership();

    return {
        converterFactory,
        contractRegistry,
        converterRegistry,
        converterRegistryData,
        legacyNetwork,
        legacyNetworkSettings,
        standardPoolConverterFactory,
        checkpointStore,
        liquidityProtectionStore,
        liquidityProtectionStats,
        liquidityProtectionSystemStore,
        liquidityProtectionWallet,
        liquidityProtectionSettings,
        liquidityProtection
    };
};
