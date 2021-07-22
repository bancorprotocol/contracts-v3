import { network } from 'hardhat';
import { loadENV } from 'hardhat.config';
import { log } from 'migration/engine/logger/logger';

export const MIGRATION_FOLDER = 'migration/migrations';
export const MIGRATION_DATA_FOLDER = 'migration/data';

const FORK_PREFIX = 'fork-';

const MAINNET = 'mainnet';

type FORK_NETWORK_SUPPORTED = typeof MAINNET;

const GET_NETWORK_NAME = () => {
    const networkForkName = loadENV<FORK_NETWORK_SUPPORTED>('FORK');

    if (networkForkName) {
        if (networkForkName === MAINNET) {
            return FORK_PREFIX + networkForkName;
        }
        log.error(`${networkForkName} is not supported, aborting.`);
        process.exit(-1);
    }
    return network.name;
};

export const NETWORK_NAME = GET_NETWORK_NAME();

export const NETWORK_STATUS = {
    isFork: NETWORK_NAME.startsWith(FORK_PREFIX),
    originalNetwork: NETWORK_NAME.substring(FORK_PREFIX.length),
    networkName: NETWORK_NAME
};
