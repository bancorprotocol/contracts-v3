/* eslint-disable camelcase */
import {
    BancorNetworkV1,
    BancorNetworkV1__factory,
    NetworkSettingsV1,
    NetworkSettingsV1__factory
} from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export { BancorNetworkV1, NetworkSettingsV1 };

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    BancorNetworkV1: deployOrAttach('BancorNetwork', BancorNetworkV1__factory, signer),
    NetworkSettingsV1: deployOrAttach('NetworkSettings', NetworkSettingsV1__factory, signer)
});

export default getContracts();
