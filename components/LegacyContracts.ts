/* eslint-disable camelcase */
import {
    BancorNetworkV1,
    BancorNetworkV1__factory,
    NetworkSettingsV1,
    NetworkSettingsV1__factory
} from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import {
    BancorNetwork__factory,
    ContractRegistry,
    ContractRegistry__factory,
    ConverterFactory,
    ConverterFactory__factory,
    ConverterRegistry,
    ConverterRegistry__factory,
    ConverterRegistryData,
    ConverterRegistryData__factory,
    BancorNetwork as LegacyBancorNetwork,
    NetworkSettings as LegacyNetworkSettings,
    LiquidityProtectionSettings,
    LiquidityProtectionSettings__factory,
    LiquidityProtectionStats,
    LiquidityProtectionStats__factory,
    LiquidityProtectionStore,
    LiquidityProtectionStore__factory,
    LiquidityProtectionSystemStore,
    LiquidityProtectionSystemStore__factory,
    NetworkSettings__factory,
    TestCheckpointStore,
    TestCheckpointStore__factory,
    TestLiquidityProtection,
    TestLiquidityProtection__factory,
    TestStandardPoolConverter,
    TestStandardPoolConverter__factory,
    TestStandardPoolConverterFactory,
    TestStandardPoolConverterFactory__factory,
    TokenHolder,
    TokenHolder__factory
} from '@bancor/contracts-solidity';
import {
    SmartToken as BNT,
    SmartToken__factory as BNT__factory,
    DSToken,
    DSToken__factory,
    TokenGovernance,
    TokenGovernance__factory,
    DSToken as VBNT,
    DSToken__factory as VBNT__factory
} from '@bancor/token-governance';
import { Signer } from 'ethers';

export {
    BNT__factory,
    BNT,
    ContractRegistry,
    ConverterFactory,
    ConverterRegistry,
    ConverterRegistryData,
    DSToken,
    LegacyBancorNetwork,
    LegacyNetworkSettings,
    LiquidityProtectionSettings,
    LiquidityProtectionStats,
    LiquidityProtectionStore,
    LiquidityProtectionSystemStore,
    TestCheckpointStore,
    TestLiquidityProtection,
    TestStandardPoolConverter,
    TestStandardPoolConverterFactory,
    TokenGovernance,
    TokenHolder,
    VBNT__factory,
    VBNT
};

export { BancorNetworkV1, BancorNetworkV1__factory, NetworkSettingsV1, NetworkSettingsV1__factory };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    // V2 contracts
    TokenGovernance: deployOrAttach('TokenGovernance', TokenGovernance__factory, signer),
    BNT: deployOrAttach('BNT', BNT__factory, signer),
    VBNT: deployOrAttach('VBNT', VBNT__factory, signer),

    ConverterFactory: deployOrAttach('ConverterFactory', ConverterFactory__factory, signer),
    ContractRegistry: deployOrAttach('ContractRegistry', ContractRegistry__factory, signer),
    ConverterRegistry: deployOrAttach('ConverterRegistry', ConverterRegistry__factory, signer),
    ConverterRegistryData: deployOrAttach('ConverterRegistryData', ConverterRegistryData__factory, signer),
    DSToken: deployOrAttach('DSToken', DSToken__factory, signer),
    LegacyBancorNetwork: deployOrAttach('LegacyBancorNetwork', BancorNetwork__factory, signer),
    LegacyNetworkSettings: deployOrAttach('LegacyNetworkSettings', NetworkSettings__factory, signer),
    TokenHolder: deployOrAttach('TokenHolder', TokenHolder__factory, signer),
    LiquidityProtectionSettings: deployOrAttach(
        'LiquidityProtectionSettings',
        LiquidityProtectionSettings__factory,
        signer
    ),
    LiquidityProtectionStats: deployOrAttach('LiquidityProtectionStats', LiquidityProtectionStats__factory, signer),
    LiquidityProtectionStore: deployOrAttach('LiquidityProtectionStore', LiquidityProtectionStore__factory, signer),
    LiquidityProtectionSystemStore: deployOrAttach(
        'LiquidityProtectionSystemStore',
        LiquidityProtectionSystemStore__factory,
        signer
    ),
    TestCheckpointStore: deployOrAttach('TestCheckpointStore', TestCheckpointStore__factory, signer),
    TestLiquidityProtection: deployOrAttach('TestLiquidityProtection', TestLiquidityProtection__factory, signer),
    TestStandardPoolConverter: deployOrAttach('TestStandardPoolConverter', TestStandardPoolConverter__factory, signer),
    TestStandardPoolConverterFactory: deployOrAttach(
        'TestStandardPoolConverterFactory',
        TestStandardPoolConverterFactory__factory,
        signer
    ),

    // V3 legacy contracts
    BancorNetworkV1: deployOrAttach('BancorNetwork', BancorNetworkV1__factory, signer),
    NetworkSettingsV1: deployOrAttach('NetworkSettings', NetworkSettingsV1__factory, signer)
});

export type LegacyContractsType = ReturnType<typeof getContracts>;

export default getContracts();
