import { PoolCollectionType1V1__factory } from '../deployments/mainnet/types';
import { ArtifactData } from './ContractBuilder';

/* eslint-disable camelcase */

const LegacyContractsV3ArtifactData: Record<string, ArtifactData> = {
    PoolCollectionType1V1: {
        abi: PoolCollectionType1V1__factory.abi,
        bytecode: PoolCollectionType1V1__factory.bytecode
    }
};

/* eslint-enable camelcase */

export default LegacyContractsV3ArtifactData;
