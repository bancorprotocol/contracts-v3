/* eslint-disable camelcase */
import { PoolCollectionType1V2, PoolCollectionType1V2__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V2 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V2: deployOrAttach('PoolCollection', PoolCollectionType1V2__factory, signer)
});

export default getContracts();
