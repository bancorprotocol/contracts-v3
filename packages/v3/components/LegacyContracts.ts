/* eslint-disable camelcase */
import { deployOrAttach } from './ContractBuilder';
import { TokenGovernance__factory } from '@bancor/token-governance';

/* eslint-enable camelcase */
import { Signer } from '@ethersproject/abstract-signer';

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    TokenGovernance: deployOrAttach('TokenGovernance', TokenGovernance__factory, signer)

    /* eslint-enable camelcase */
});

export type ContractsType = ReturnType<typeof getContracts>;

export default getContracts();
