import { network } from 'hardhat';
import { loadENV } from 'hardhat.config';

export const MIGRATION_FOLDER = 'migration/migrations';
export const MIGRATION_DATA_FOLDER = 'migration/data';

const GET_NETWORK_NAME = () => {
    const networkForkName = loadENV('FORK');
    if (networkForkName) {
        return 'fork-' + networkForkName;
    }
    return network.name;
};

export const NETWORK_NAME = GET_NETWORK_NAME();
