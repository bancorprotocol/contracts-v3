import { getNamedSigners, isTenderlyFork } from '../utils/Deploy';
import { toWei } from '../utils/Types';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { ethers } from 'hardhat';
import 'hardhat-deploy';
import { setTimeout } from 'timers/promises';

const TIMEOUT = 30 * 1000; // 30 seconds

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    const { ethWhale } = await getNamedSigners();

    while (true) {
        try {
            const { timestamp, number } = await ethers.provider.getBlock('latest');

            console.log(`Current block=${number}, timestamp=${timestamp}`);
            console.log(`Waiting for ${TIMEOUT / 1000} seconds...`);
            console.log('');

            await setTimeout(TIMEOUT);

            await ethWhale.sendTransaction({
                value: toWei(1),
                to: ethWhale.address
            });
        } catch (e: unknown) {
            console.error(`Failed with: ${e}. Resuming in ${TIMEOUT / 1000} seconds...`);
            console.error('');

            await setTimeout(TIMEOUT);
        }
    }
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
