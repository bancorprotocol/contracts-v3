/* eslint-disable camelcase */
import { PoolCollectionType1V1, PoolCollectionType1V1__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V1 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V1: deployOrAttach('PoolCollection', PoolCollectionType1V1__factory, signer)
});

export default getContracts();
