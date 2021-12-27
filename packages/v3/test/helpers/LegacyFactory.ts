import LegacyContracts, { TokenGovernance } from '../../components/LegacyContracts';
import { IERC20, TestBancorNetwork, MasterVault } from '../../typechain-types';
import { TokenWithAddress } from '../helpers/Utils';
import { DEFAULT_DECIMALS } from './Constants';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

const {
    registry: { CONVERTER_FACTORY, CONVERTER_REGISTRY, CONVERTER_REGISTRY_DATA, BANCOR_NETWORK, NETWORK_SETTINGS },
    roles: { ROLE_OWNER },
    PPM_RESOLUTION
    // eslint-disable-next-line @typescript-eslint/no-var-requires
} = require('../../../v2/test/helpers/Constants');

export const createLegacySystem = async (
    owner: SignerWithAddress,
    network: TestBancorNetwork,
    vault: MasterVault,
    networkToken: IERC20,
    networkTokenGovernance: TokenGovernance,
    govTokenGovernance: TokenGovernance,
    baseToken: TokenWithAddress
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
    const liquidityProtectionWallet = await LegacyContracts.TokenHolder.deploy();
    const liquidityProtectionSettings = await LegacyContracts.LiquidityProtectionSettings.deploy(
        networkToken.address,
        contractRegistry.address
    );
    const liquidityProtection = await LegacyContracts.TestLiquidityProtection.deploy(
        network.address,
        vault.address,
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

    await converterRegistry.newConverter(
        3 /* Standard Pool Converter Type */,
        'PT',
        'PT',
        DEFAULT_DECIMALS,
        PPM_RESOLUTION,
        [baseToken.address, networkToken.address],
        [PPM_RESOLUTION.div(2), PPM_RESOLUTION.div(2)]
    );

    const anchorCount = await converterRegistry.getAnchorCount();
    const poolTokenAddress = await converterRegistry.getAnchor(anchorCount.sub(1));
    const poolToken = await LegacyContracts.DSToken.attach(poolTokenAddress);
    const converterAddress = await poolToken.owner();
    const converter = await LegacyContracts.TestStandardPoolConverter.attach(converterAddress);

    await converter.acceptOwnership();

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
        liquidityProtection,
        poolToken,
        converter
    };
};
