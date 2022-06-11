/* eslint-disable camelcase */
import { PoolCollectionType1V5, PoolCollectionType1V5__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V5 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V5: deployOrAttach('PoolCollection', PoolCollectionType1V5__factory, signer)
});

export default getContracts();
