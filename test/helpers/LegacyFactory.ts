import { IERC20, MasterVault, TestBancorNetwork } from '../../components/Contracts';
import LegacyContracts, { Registry, Roles, TokenGovernance } from '../../components/LegacyContracts';
import { PPM_RESOLUTION } from '../../utils/Constants';
import { DEFAULT_DECIMALS } from '../../utils/TokenData';
import { TokenWithAddress } from './Factory';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

export const createLegacySystem = async (
    owner: SignerWithAddress,
    network: TestBancorNetwork,
    vault: MasterVault,
    bnt: IERC20,
    bntGovernance: TokenGovernance,
    vbntGovernance: TokenGovernance,
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

    await contractRegistry.registerAddress(Registry.CONVERTER_FACTORY, converterFactory.address);
    await contractRegistry.registerAddress(Registry.CONVERTER_REGISTRY, converterRegistry.address);
    await contractRegistry.registerAddress(Registry.CONVERTER_REGISTRY_DATA, converterRegistryData.address);
    await contractRegistry.registerAddress(Registry.BANCOR_NETWORK, legacyNetwork.address);
    await contractRegistry.registerAddress(Registry.NETWORK_SETTINGS, legacyNetworkSettings.address);

    const liquidityProtectionStore = await LegacyContracts.LiquidityProtectionStore.deploy();
    const liquidityProtectionStats = await LegacyContracts.LiquidityProtectionStats.deploy();
    const liquidityProtectionSystemStore = await LegacyContracts.LiquidityProtectionSystemStore.deploy();
    const liquidityProtectionWallet = await LegacyContracts.TokenHolder.deploy();
    const liquidityProtectionSettings = await LegacyContracts.LiquidityProtectionSettings.deploy(
        bnt.address,
        contractRegistry.address
    );
    const liquidityProtection = await LegacyContracts.TestLiquidityProtection.deploy(
        vault.address,
        liquidityProtectionSettings.address,
        liquidityProtectionStore.address,
        liquidityProtectionStats.address,
        liquidityProtectionSystemStore.address,
        liquidityProtectionWallet.address,
        bntGovernance.address,
        vbntGovernance.address
    );

    await liquidityProtectionSettings.grantRole(
        Roles.LiquidityProtectionSettings.ROLE_OWNER,
        liquidityProtection.address
    );
    await liquidityProtectionStats.grantRole(Roles.LiquidityProtectionStats.ROLE_OWNER, liquidityProtection.address);
    await liquidityProtectionSystemStore.grantRole(
        Roles.LiquidityProtectionSystemStore.ROLE_OWNER,
        liquidityProtection.address
    );
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
        [baseToken.address, bnt.address],
        [PPM_RESOLUTION / 2, PPM_RESOLUTION / 2]
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
