import { PoolCollectionType1V2__factory } from '../deployments/mainnet/types';
import { ArtifactData } from './ContractBuilder';

/* eslint-disable camelcase */

const LegacyContractsV3ArtifactData: Record<string, ArtifactData> = {
    PoolCollectionType1V2: {
        abi: PoolCollectionType1V2__factory.abi,
        bytecode: PoolCollectionType1V2__factory.bytecode
    }
};

/* eslint-enable camelcase */

export default LegacyContractsV3ArtifactData;
