/* eslint-disable camelcase */
import {
    BancorNetworkV5,
    BancorNetworkV5__factory,
    PoolCollectionType1V3,
    PoolCollectionType1V3__factory,
    PoolCollectionType1V4,
    PoolCollectionType1V4__factory,
    PoolMigratorV3,
    PoolMigratorV3__factory
} from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { BancorNetworkV5, PoolCollectionType1V3, PoolCollectionType1V4, PoolMigratorV3 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    BancorNetworkV5: deployOrAttach('BancorNetwork', BancorNetworkV5__factory, signer),
    PoolCollectionType1V3: deployOrAttach('PoolCollection', PoolCollectionType1V3__factory, signer),
    PoolCollectionType1V4: deployOrAttach('PoolCollection', PoolCollectionType1V4__factory, signer),
    PoolMigratorV3: deployOrAttach('PoolMigrator', PoolMigratorV3__factory, signer)
});

export default getContracts();
