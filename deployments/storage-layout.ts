import Logger from '../utils/Logger';
import { storageLayout } from 'hardhat';

const main = async () => {
    await storageLayout.export();
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        Logger.error(error);
        process.exit(1);
    });
