/* eslint-disable camelcase */
import { PoolCollectionType1V8, PoolCollectionType1V8__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V8 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V8: deployOrAttach('PoolCollection', PoolCollectionType1V8__factory, signer)
});

export default getContracts();
