import { BancorNetworkV1__factory, NetworkSettingsV1__factory } from '../deployments/mainnet/types';
import { ArtifactData } from './ContractBuilder';

/* eslint-disable camelcase */

const LegacyContractsArtifactData: Record<string, ArtifactData> = {
    BancorNetworkV1: {
        abi: BancorNetworkV1__factory.abi,
        bytecode: BancorNetworkV1__factory.bytecode
    },

    NetworkSettingsV1: {
        abi: NetworkSettingsV1__factory.abi,
        bytecode: NetworkSettingsV1__factory.bytecode
    }
};

/* eslint-enable camelcase */

export default LegacyContractsArtifactData;
