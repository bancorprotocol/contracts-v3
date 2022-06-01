/* eslint-disable camelcase */
import { PoolCollectionType1V3, PoolCollectionType1V3__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V3 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V3: deployOrAttach('PoolCollection', PoolCollectionType1V3__factory, signer)
});

export default getContracts();
