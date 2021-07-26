import { network } from 'hardhat';
import { FORK_CONFIG, FORK_PREFIX } from 'hardhat.config';

export const MIGRATION_FOLDER = 'migration/migrations';
export const MIGRATION_DATA_FOLDER = 'migration/data';

const GET_NETWORK_NAME = () => {
    if (FORK_CONFIG) {
        return FORK_CONFIG.networkName;
    }
    return network.name;
};
export const NETWORK_NAME = GET_NETWORK_NAME();

export const MIGRATION_CONFIG = {
    isFork: NETWORK_NAME.startsWith(FORK_PREFIX),
    originalNetwork: NETWORK_NAME.substring(FORK_PREFIX.length),
    networkName: NETWORK_NAME
};
