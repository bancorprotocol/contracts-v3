/* eslint-disable camelcase */
import {
    BancorNetworkV1,
    BancorNetworkV1__factory,
    BancorNetworkV2,
    BancorNetworkV2__factory,
    NetworkSettingsV1,
    NetworkSettingsV1__factory,
    PendingWithdrawalsV1,
    PendingWithdrawalsV1__factory,
    PoolCollectionType1V1,
    PoolCollectionType1V1__factory,
    PoolCollectionType1V2,
    PoolCollectionType1V2__factory,
    PoolMigratorV1,
    PoolMigratorV1__factory,
    StandardRewardsV1,
    StandardRewardsV1__factory,
    StandardRewardsV2,
    StandardRewardsV2__factory
} from '../deployments/mainnet/types';
import { deployOrAttach } from './ContractBuilder';
import { Signer } from 'ethers';

export {
    BancorNetworkV1,
    BancorNetworkV2,
    NetworkSettingsV1,
    PendingWithdrawalsV1,
    PoolCollectionType1V1,
    PoolCollectionType1V2,
    PoolMigratorV1,
    StandardRewardsV1,
    StandardRewardsV2
};

/* eslint-enable camelcase */

const getContracts = (signer?: Signer) => ({
    connect: (signer: Signer) => getContracts(signer),

    BancorNetworkV1: deployOrAttach('BancorNetwork', BancorNetworkV1__factory, signer),
    BancorNetworkV2: deployOrAttach('BancorNetwork', BancorNetworkV2__factory, signer),
    NetworkSettingsV1: deployOrAttach('NetworkSettings', NetworkSettingsV1__factory, signer),
    PendingWithdrawalsV1: deployOrAttach('PendingWithdrawals', PendingWithdrawalsV1__factory, signer),
    PoolCollectionType1V1: deployOrAttach('PoolCollection', PoolCollectionType1V1__factory, signer),
    PoolCollectionType1V2: deployOrAttach('PoolCollection', PoolCollectionType1V2__factory, signer),
    PoolMigratorV1: deployOrAttach('PoolMigrator', PoolMigratorV1__factory, signer),
    StandardRewardsV1: deployOrAttach('StandardRewards', StandardRewardsV1__factory, signer),
    StandardRewardsV2: deployOrAttach('StandardRewards', StandardRewardsV2__factory, signer)
});

export default getContracts();
