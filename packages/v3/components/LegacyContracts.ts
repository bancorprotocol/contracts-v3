/* eslint-disable camelcase */
import { deployOrAttach } from './ContractBuilder';
import {
    TokenGovernance__factory,
    SmartToken__factory as NetworkToken__factory,
    SmartToken as NetworkToken,
    DSToken__factory as GovToken__factory,
    DSToken as GovToken
} from '@bancor/token-governance';
import { Signer } from '@ethersproject/abstract-signer';

export { NetworkToken, GovToken };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    TokenGovernance: deployOrAttach('TokenGovernance', TokenGovernance__factory, signer),
    NetworkToken: deployOrAttach('BNTToken', NetworkToken__factory, signer),
    GovToken: deployOrAttach('vBNTToken', GovToken__factory, signer)
});

export type ContractsType = ReturnType<typeof getContracts>;

export default getContracts();
