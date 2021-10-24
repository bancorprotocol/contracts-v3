import { deployOrAttach } from './ContractBuilder';
import {
    BancorNetwork as LegacyBancorNetwork,
    BancorNetwork__factory,
    ConverterFactory__factory,
    ConverterFactory,
    ContractRegistry__factory,
    ContractRegistry,
    ConverterRegistry__factory,
    ConverterRegistry,
    ConverterRegistryData__factory,
    ConverterRegistryData,
    NetworkSettings__factory,
    NetworkSettings as LegacyNetworkSettings,
    StandardPoolConverter__factory,
    StandardPoolConverter,
    StandardPoolConverterFactory__factory,
    StandardPoolConverterFactory
} from '@bancor-v2/typechain';

/* eslint-disable camelcase */
import {
    DSToken as GovToken,
    DSToken__factory as GovToken__factory,
    SmartToken as NetworkToken,
    SmartToken__factory as NetworkToken__factory,
    TokenGovernance__factory
} from '@bancor/token-governance';
import { Signer } from 'ethers';

/* eslint-enable camelcase */

export { NetworkToken, GovToken };

export {
    ConverterFactory,
    ContractRegistry,
    ConverterRegistry,
    ConverterRegistryData,
    LegacyBancorNetwork,
    LegacyNetworkSettings,
    StandardPoolConverter,
    StandardPoolConverterFactory
};

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    TokenGovernance: deployOrAttach('TokenGovernance', TokenGovernance__factory, signer),
    NetworkToken: deployOrAttach('NetworkToken', NetworkToken__factory, signer),
    GovToken: deployOrAttach('GovToken', GovToken__factory, signer),

    ConverterFactory: deployOrAttach('ConverterFactory', ConverterFactory__factory, signer),
    ContractRegistry: deployOrAttach('ContractRegistry', ContractRegistry__factory, signer),
    ConverterRegistry: deployOrAttach('ConverterRegistry', ConverterRegistry__factory, signer),
    ConverterRegistryData: deployOrAttach('ConverterRegistryData', ConverterRegistryData__factory, signer),
    LegacyBancorNetwork: deployOrAttach('LegacyBancorNetwork', BancorNetwork__factory, signer),
    LegacyNetworkSettings: deployOrAttach('LegacyNetworkSettings', NetworkSettings__factory, signer),
    StandardPoolConverter: deployOrAttach('StandardPoolConverter', StandardPoolConverter__factory, signer),
    StandardPoolConverterFactory: deployOrAttach(
        'StandardPoolConverterFactory',
        StandardPoolConverterFactory__factory,
        signer
    )
});

export type LegacyContractsType = ReturnType<typeof getContracts>;

export default getContracts();
