/* eslint-disable camelcase */
import { PoolCollectionType1V4, PoolCollectionType1V4__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V4 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V4: deployOrAttach('PoolCollection', PoolCollectionType1V4__factory, signer)
});

export default getContracts();
