/* eslint-disable camelcase */
import { deployOrAttach } from './ContractBuilder';
import {
    TokenGovernance__factory,
    SmartToken__factory as BNTToken__factory,
    DSToken__factory as vBNTToken__factory
} from '@bancor/token-governance';

/* eslint-enable camelcase */
import { Signer } from '@ethersproject/abstract-signer';

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    TokenGovernance: deployOrAttach('TokenGovernance', TokenGovernance__factory, signer),
    BNTToken: deployOrAttach('BNTToken', BNTToken__factory, signer),
    vBNTToken: deployOrAttach('vBNTToken', vBNTToken__factory, signer)

    /* eslint-enable camelcase */
});

export type ContractsType = ReturnType<typeof getContracts>;

export default getContracts();
