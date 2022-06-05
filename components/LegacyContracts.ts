/* eslint-disable camelcase */
import {
    IUniswapV2Factory,
    IUniswapV2Factory__factory,
    IUniswapV2Router02,
    IUniswapV2Router02__factory
} from '../typechain-types';
import { toPPM } from '../utils/Types';
import { deployOrAttach } from './ContractBuilder';
import {
    BancorNetwork__factory,
    CheckpointStore,
    CheckpointStore__factory,
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
    LiquidityProtection,
    LiquidityProtection__factory,
    LiquidityProtectionSettings,
    LiquidityProtectionSettings__factory,
    LiquidityProtectionStats,
    LiquidityProtectionStats__factory,
    LiquidityProtectionStore,
    LiquidityProtectionStore__factory,
    LiquidityProtectionSystemStore,
    LiquidityProtectionSystemStore__factory,
    NetworkSettings__factory,
    Owned,
    Owned__factory,
    StakingRewards,
    StakingRewards__factory,
    StakingRewardsClaim,
    StakingRewardsClaim__factory,
    StakingRewardsStore,
    StakingRewardsStore__factory,
    StandardPoolConverter__factory,
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
import { Signer, utils } from 'ethers';

const { formatBytes32String, id } = utils;

export { BNT__factory, BNT, VBNT, VBNT__factory, DSToken, TokenGovernance };

export {
    CheckpointStore,
    ContractRegistry,
    ConverterFactory,
    ConverterRegistry,
    ConverterRegistryData,
    LegacyBancorNetwork,
    LegacyNetworkSettings,
    LiquidityProtection,
    LiquidityProtectionSettings,
    LiquidityProtectionStats,
    LiquidityProtectionStore,
    LiquidityProtectionSystemStore,
    StakingRewards,
    StakingRewardsClaim,
    StakingRewardsStore,
    TestCheckpointStore,
    TestLiquidityProtection,
    TestStandardPoolConverter,
    TestStandardPoolConverterFactory,
    TokenHolder,
    Owned
};

export { IUniswapV2Factory, IUniswapV2Factory__factory, IUniswapV2Router02, IUniswapV2Router02__factory };

export const Registry = {
    BANCOR_NETWORK: formatBytes32String('BancorNetwork'),
    NETWORK_SETTINGS: formatBytes32String('NetworkSettings'),
    CONVERTER_FACTORY: formatBytes32String('ConverterFactory'),
    CONVERTER_REGISTRY: formatBytes32String('BancorConverterRegistry'),
    CONVERTER_REGISTRY_DATA: formatBytes32String('BancorConverterRegistryData'),
    LIQUIDITY_PROTECTION: formatBytes32String('LiquidityProtection')
};

export const Roles = {
    CheckpointStore: {
        ROLE_OWNER: id('ROLE_OWNER')
    },
    LiquidityProtectionSettings: {
        ROLE_OWNER: id('ROLE_OWNER')
    },
    LiquidityProtectionStats: {
        ROLE_SUPERVISOR: id('ROLE_SUPERVISOR'),
        ROLE_OWNER: id('ROLE_OWNER')
    },
    LiquidityProtectionSystemStore: {
        ROLE_SUPERVISOR: id('ROLE_SUPERVISOR'),
        ROLE_OWNER: id('ROLE_OWNER')
    },
    StakingRewards: {
        ROLE_SUPERVISOR: id('ROLE_SUPERVISOR'),
        ROLE_PUBLISHER: id('ROLE_PUBLISHER')
    },
    StakingRewardsStore: {
        ROLE_MANAGER: id('ROLE_MANAGER'),
        ROLE_SEEDER: id('ROLE_SEEDER')
    }
};

export const STANDARD_CONVERTER_TYPE = 3;
export const STANDARD_POOL_CONVERTER_WEIGHT = toPPM(50);

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    TokenGovernance: deployOrAttach('TokenGovernance', TokenGovernance__factory, signer),
    BNT: deployOrAttach('BNT', BNT__factory, signer),
    VBNT: deployOrAttach('VBNT', VBNT__factory, signer),

    CheckpointStore: deployOrAttach('CheckpointStore', CheckpointStore__factory, signer),
    ConverterFactory: deployOrAttach('ConverterFactory', ConverterFactory__factory, signer),
    ContractRegistry: deployOrAttach('ContractRegistry', ContractRegistry__factory, signer),
    ConverterRegistry: deployOrAttach('ConverterRegistry', ConverterRegistry__factory, signer),
    ConverterRegistryData: deployOrAttach('ConverterRegistryData', ConverterRegistryData__factory, signer),
    DSToken: deployOrAttach('DSToken', DSToken__factory, signer),
    Owned: deployOrAttach('Owned', Owned__factory, signer),
    LegacyBancorNetwork: deployOrAttach('LegacyBancorNetwork', BancorNetwork__factory, signer),
    LegacyNetworkSettings: deployOrAttach('LegacyNetworkSettings', NetworkSettings__factory, signer),
    LiquidityProtection: deployOrAttach('LiquidityProtection', LiquidityProtection__factory, signer),
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
    StakingRewards: deployOrAttach('StakingRewards', StakingRewards__factory, signer),
    StakingRewardsClaim: deployOrAttach('StakingRewardsClaim', StakingRewardsClaim__factory, signer),
    StakingRewardsStore: deployOrAttach('StakingRewardsStore', StakingRewardsStore__factory, signer),
    StandardPoolConverter: deployOrAttach('StandardPoolConverter', StandardPoolConverter__factory, signer),
    TestCheckpointStore: deployOrAttach('TestCheckpointStore', TestCheckpointStore__factory, signer),
    TestLiquidityProtection: deployOrAttach('TestLiquidityProtection', TestLiquidityProtection__factory, signer),
    TestStandardPoolConverter: deployOrAttach('TestStandardPoolConverter', TestStandardPoolConverter__factory, signer),
    TestStandardPoolConverterFactory: deployOrAttach(
        'TestStandardPoolConverterFactory',
        TestStandardPoolConverterFactory__factory,
        signer
    ),
    TokenHolder: deployOrAttach('TokenHolder', TokenHolder__factory, signer)
});

export default getContracts();
