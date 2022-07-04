/* eslint-disable camelcase */
import { PoolCollectionType1V6, PoolCollectionType1V6__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V6 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V6: deployOrAttach('PoolCollection', PoolCollectionType1V6__factory, signer)
});

export default getContracts();
