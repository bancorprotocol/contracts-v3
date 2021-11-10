import {
    BancorNetwork as LegacyBancorNetwork,
    BancorNetwork__factory,
    TestCheckpointStore__factory,
    TestCheckpointStore,
    ConverterFactory__factory,
    ConverterFactory,
    ContractRegistry__factory,
    ContractRegistry,
    ConverterRegistry__factory,
    ConverterRegistry,
    ConverterRegistryData__factory,
    ConverterRegistryData,
    LiquidityProtectionSettings__factory,
    LiquidityProtectionSettings,
    LiquidityProtectionStats__factory,
    LiquidityProtectionStats,
    LiquidityProtectionStore__factory,
    LiquidityProtectionStore,
    LiquidityProtectionSystemStore__factory,
    LiquidityProtectionSystemStore,
    TestLiquidityProtection__factory,
    TestLiquidityProtection,
    NetworkSettings__factory,
    NetworkSettings as LegacyNetworkSettings,
    TestStandardPoolConverter__factory,
    TestStandardPoolConverter,
    TestStandardPoolConverterFactory__factory,
    TestStandardPoolConverterFactory,
    TokenHolder__factory,
    TokenHolder as LegacyTokenHolder
} from '../../v2/typechain';
import { deployOrAttach } from './ContractBuilder';

/* eslint-disable camelcase */
import {
    DSToken as GovToken,
    DSToken__factory as GovToken__factory,
    SmartToken as NetworkToken,
    SmartToken__factory as NetworkToken__factory,
    TokenGovernance__factory
} from '@bancor/token-governance';
import { Signer } from 'ethers';

/* eslint-enable camelcase */

export {
    NetworkToken,
    GovToken,
    TestCheckpointStore,
    ConverterFactory,
    ContractRegistry,
    ConverterRegistry,
    ConverterRegistryData,
    LegacyBancorNetwork,
    LegacyNetworkSettings,
    LegacyTokenHolder,
    LiquidityProtectionSettings,
    LiquidityProtectionStats,
    LiquidityProtectionStore,
    LiquidityProtectionSystemStore,
    TestLiquidityProtection,
    TestStandardPoolConverter,
    TestStandardPoolConverterFactory
};

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    TokenGovernance: deployOrAttach('TokenGovernance', TokenGovernance__factory, signer),
    NetworkToken: deployOrAttach('NetworkToken', NetworkToken__factory, signer),
    GovToken: deployOrAttach('GovToken', GovToken__factory, signer),

    TestCheckpointStore: deployOrAttach('TestCheckpointStore', TestCheckpointStore__factory, signer),
    ConverterFactory: deployOrAttach('ConverterFactory', ConverterFactory__factory, signer),
    ContractRegistry: deployOrAttach('ContractRegistry', ContractRegistry__factory, signer),
    ConverterRegistry: deployOrAttach('ConverterRegistry', ConverterRegistry__factory, signer),
    ConverterRegistryData: deployOrAttach('ConverterRegistryData', ConverterRegistryData__factory, signer),
    LegacyBancorNetwork: deployOrAttach('LegacyBancorNetwork', BancorNetwork__factory, signer),
    LegacyNetworkSettings: deployOrAttach('LegacyNetworkSettings', NetworkSettings__factory, signer),
    LegacyTokenHolder: deployOrAttach('LegacyTokenHolder', TokenHolder__factory, signer),
    LiquidityProtectionSettings: deployOrAttach('LiquidityProtectionSettings', LiquidityProtectionSettings__factory, signer),
    LiquidityProtectionStats: deployOrAttach('LiquidityProtectionStats', LiquidityProtectionStats__factory, signer),
    LiquidityProtectionStore: deployOrAttach('LiquidityProtectionStore', LiquidityProtectionStore__factory, signer),
    LiquidityProtectionSystemStore: deployOrAttach('LiquidityProtectionSystemStore', LiquidityProtectionSystemStore__factory, signer),
    TestLiquidityProtection: deployOrAttach('TestLiquidityProtection', TestLiquidityProtection__factory, signer),
    TestStandardPoolConverter: deployOrAttach('TestStandardPoolConverter', TestStandardPoolConverter__factory, signer),
    TestStandardPoolConverterFactory: deployOrAttach(
        'TestStandardPoolConverterFactory',
        TestStandardPoolConverterFactory__factory,
        signer
    )
});

export type LegacyContractsType = ReturnType<typeof getContracts>;

export default getContracts();
