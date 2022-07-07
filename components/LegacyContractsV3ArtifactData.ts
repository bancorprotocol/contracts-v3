import { PoolCollectionType1V7__factory } from '../deployments/mainnet/types';
import { ArtifactData } from './ContractBuilder';

/* eslint-disable camelcase */

const LegacyContractsV3ArtifactData: Record<string, ArtifactData> = {
    PoolCollectionType1V7: {
        abi: PoolCollectionType1V7__factory.abi,
        bytecode: PoolCollectionType1V7__factory.bytecode
    }
};

/* eslint-enable camelcase */

export default LegacyContractsV3ArtifactData;
