import { PoolCollectionType1V10__factory } from '../deployments/mainnet/types';
import { ArtifactData } from './ContractBuilder';

/* eslint-disable camelcase */

const LegacyContractsV3ArtifactData: Record<string, ArtifactData> = {
    PoolCollectionType1V10: {
        abi: PoolCollectionType1V10__factory.abi,
        bytecode: PoolCollectionType1V10__factory.bytecode
    }
};

/* eslint-enable camelcase */

export default LegacyContractsV3ArtifactData;
