/* eslint-disable camelcase */
import { PoolCollectionType1V7, PoolCollectionType1V7__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V7 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V7: deployOrAttach('PoolCollection', PoolCollectionType1V7__factory, signer)
});

export default getContracts();
