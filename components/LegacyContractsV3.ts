/* eslint-disable camelcase */
import { PoolCollectionType1V11, PoolCollectionType1V11__factory } from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { PoolCollectionType1V11 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    PoolCollectionType1V11: deployOrAttach('PoolCollection', PoolCollectionType1V11__factory, signer)
});

export default getContracts();
