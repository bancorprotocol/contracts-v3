import { deployOrAttach } from './ContractBuilder';
import {
    BancorNetwork as LegacyBancorNetwork,
    BancorNetwork__factory,
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
    NetworkSettings__factory,
    NetworkSettings as LegacyNetworkSettings,
    TestCheckpointStore__factory,
    TestCheckpointStore,
    TestLiquidityProtection__factory,
    TestLiquidityProtection,
    TestStandardPoolConverter__factory,
    TestStandardPoolConverter,
    TestStandardPoolConverterFactory__factory,
    TestStandardPoolConverterFactory,
    TokenHolder__factory,
    TokenHolder
} from '@bancor/contracts-solidity';

/* eslint-disable camelcase */
import {
    DSToken,
    DSToken__factory,
    DSToken as VBNT,
    DSToken__factory as VBNT__factory,
    SmartToken as BNT,
    SmartToken__factory as BNT__factory,
    TokenGovernance,
    TokenGovernance__factory
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

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

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
    )
});

export type LegacyContractsType = ReturnType<typeof getContracts>;

export default getContracts();
