import { FORK_CONFIG, FORK_PREFIX } from '../../hardhat.config';
import { network } from 'hardhat';

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
    isHardhat: NETWORK_NAME === 'hardhat',
    isTestnet: NETWORK_NAME === 'rinkeby',
    originalNetwork: NETWORK_NAME.startsWith(FORK_PREFIX) ? NETWORK_NAME.substring(FORK_PREFIX.length) : NETWORK_NAME,
    networkName: NETWORK_NAME
};
