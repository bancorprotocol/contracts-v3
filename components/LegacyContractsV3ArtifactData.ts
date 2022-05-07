import {
    BancorNetworkV1__factory,
    BancorNetworkV2__factory,
    NetworkSettingsV1__factory,
    PendingWithdrawalsV1__factory,
    PoolCollectionType1V1__factory,
    StandardRewardsV1__factory,
    StandardRewardsV2__factory
} from '../deployments/mainnet/types';
import { ArtifactData } from './ContractBuilder';

/* eslint-disable camelcase */

const LegacyContractsV3ArtifactData: Record<string, ArtifactData> = {
    BancorNetworkV1: {
        abi: BancorNetworkV1__factory.abi,
        bytecode: BancorNetworkV1__factory.bytecode
    },

    BancorNetworkV2: {
        abi: BancorNetworkV2__factory.abi,
        bytecode: BancorNetworkV2__factory.bytecode
    },

    NetworkSettingsV1: {
        abi: NetworkSettingsV1__factory.abi,
        bytecode: NetworkSettingsV1__factory.bytecode
    },

    PendingWithdrawalsV1: {
        abi: PendingWithdrawalsV1__factory.abi,
        bytecode: PendingWithdrawalsV1__factory.bytecode
    },

    PoolCollectionType1V1: {
        abi: PoolCollectionType1V1__factory.abi,
        bytecode: PoolCollectionType1V1__factory.bytecode
    },

    StandardRewardsV1: {
        abi: StandardRewardsV1__factory.abi,
        bytecode: StandardRewardsV1__factory.bytecode
    },

    StandardRewardsV2: {
        abi: StandardRewardsV2__factory.abi,
        bytecode: StandardRewardsV2__factory.bytecode
    }
};

/* eslint-enable camelcase */

export default LegacyContractsV3ArtifactData;
