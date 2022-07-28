/* eslint-disable camelcase */
import { PoolCollectionType1V9, PoolCollectionType1V9__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V9 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V9: deployOrAttach('PoolCollection', PoolCollectionType1V9__factory, signer)
});

export default getContracts();
