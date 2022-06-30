import { PoolCollectionType1V6__factory } from '../deployments/mainnet/types';
import { ArtifactData } from './ContractBuilder';

/* eslint-disable camelcase */

const LegacyContractsV3ArtifactData: Record<string, ArtifactData> = {
    PoolCollectionType1V6: {
        abi: PoolCollectionType1V6__factory.abi,
        bytecode: PoolCollectionType1V6__factory.bytecode
    }
};

/* eslint-enable camelcase */

export default LegacyContractsV3ArtifactData;
