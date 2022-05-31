import {
    PoolCollectionType1V3__factory,
    PoolCollectionType1V4__factory,
    PoolMigratorV3__factory
} from '../deployments/mainnet/types';
import { ArtifactData } from './ContractBuilder';

/* eslint-disable camelcase */

const LegacyContractsV3ArtifactData: Record<string, ArtifactData> = {
    PoolCollectionType1V3: {
        abi: PoolCollectionType1V3__factory.abi,
        bytecode: PoolCollectionType1V3__factory.bytecode
    },

    PoolCollectionType1V4: {
        abi: PoolCollectionType1V4__factory.abi,
        bytecode: PoolCollectionType1V4__factory.bytecode
    },

    PoolMigratorV3: {
        abi: PoolMigratorV3__factory.abi,
        bytecode: PoolMigratorV3__factory.bytecode
    }
};

/* eslint-enable camelcase */

export default LegacyContractsV3ArtifactData;
