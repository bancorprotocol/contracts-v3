/* eslint-disable camelcase */
import { PoolCollectionType1V10, PoolCollectionType1V10__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V10 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V10: deployOrAttach('PoolCollection', PoolCollectionType1V10__factory, signer)
});

export default getContracts();
