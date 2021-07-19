import {
    BancorNetwork__factory,
    ConverterFactory__factory,
    ConverterRegistryData__factory,
    ConverterRegistry__factory,
    ConverterUpgrader__factory,
    LiquidityProtectionSettings__factory,
    LiquidityProtectionStats__factory,
    LiquidityProtectionStore__factory,
    LiquidityProtectionSystemStore__factory,
    LiquidityProtection__factory,
    NetworkSettings__factory,
    StakingRewardsStore__factory,
    StakingRewards__factory,
    TokenHolder__factory
} from '@bancor/contracts-v2/typechain';
import { ContractRegistry } from '@bancor/contracts-v2/typechain';
import { Signer } from 'ethers';
import { formatBytes32String } from 'ethers/lib/utils';

export const fetchV2ContractState = async (ContractRegistry: ContractRegistry, signer: Signer) => {
    return {
        BancorNetwork: BancorNetwork__factory.connect(
            await ContractRegistry.addressOf(formatBytes32String('BancorNetwork')),
            signer
        ),

        LiquidityProtection: await fetchLiquidityProtectionContracts(ContractRegistry, signer),
        StakingRewards: await fetchStakingRewardsContracts(ContractRegistry, signer),
        Converter: await fetchConverter(ContractRegistry, signer),
        NetworkSettings: await fetchNetworkSettings(ContractRegistry, signer)
    };
};

export const fetchConverter = async (ContractRegistry: ContractRegistry, signer: Signer) => {
    return {
        ConverterRegistry: ConverterRegistry__factory.connect(
            await ContractRegistry.addressOf(formatBytes32String('BancorConverterRegistry')),
            signer
        ),
        ConverterRegistryData: ConverterRegistryData__factory.connect(
            await ContractRegistry.addressOf(formatBytes32String('BancorConverterRegistryData')),
            signer
        ),
        ConverterUpgrader: ConverterUpgrader__factory.connect(
            await ContractRegistry.addressOf(formatBytes32String('BancorConverterUpgrader')),
            signer
        ),
        ConverterFactory: ConverterFactory__factory.connect(
            await ContractRegistry.addressOf(formatBytes32String('ConverterFactory')),
            signer
        )
    };
};

export const fetchNetworkSettings = async (ContractRegistry: ContractRegistry, signer: Signer) => {
    const NetworkSettings = NetworkSettings__factory.connect(
        await ContractRegistry.addressOf(formatBytes32String('NetworkSettings')),
        signer
    );
    const NetworkFeeWallet = TokenHolder__factory.connect(await NetworkSettings.networkFeeWallet(), signer);

    return { NetworkSettings, NetworkFeeWallet };
};

export const fetchLiquidityProtectionContracts = async (ContractRegistry: ContractRegistry, signer: Signer) => {
    const LiquidityProtection = LiquidityProtection__factory.connect(
        await ContractRegistry.addressOf(formatBytes32String('LiquidityProtection')),
        signer
    );
    const LiquidityProtectionStore = LiquidityProtectionStore__factory.connect(
        await LiquidityProtection.store(),
        signer
    );
    const LiquidityProtectionSystemStore = LiquidityProtectionSystemStore__factory.connect(
        await LiquidityProtection.systemStore(),
        signer
    );
    const LiquidityProtectionStats = LiquidityProtectionStats__factory.connect(
        await LiquidityProtection.stats(),
        signer
    );
    const LiquidityProtectionSettings = LiquidityProtectionSettings__factory.connect(
        await LiquidityProtection.settings(),
        signer
    );

    return {
        LiquidityProtection,
        LiquidityProtectionStore,
        LiquidityProtectionSystemStore,
        LiquidityProtectionStats,
        LiquidityProtectionSettings
    };
};

export const fetchStakingRewardsContracts = async (ContractRegistry: ContractRegistry, signer: Signer) => {
    const StakingRewards = StakingRewards__factory.connect(
        await ContractRegistry.addressOf(formatBytes32String('StakingRewards')),
        signer
    );
    const StakingRewardsStore = StakingRewardsStore__factory.connect(await StakingRewards.store(), signer);

    return { StakingRewards, StakingRewardsStore };
};
