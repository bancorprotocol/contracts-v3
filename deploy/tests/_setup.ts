import { createTenderlyFork, getForkId, isTenderlyFork } from '../../utils/Deploy';
import axios from 'axios';

interface EnvOptions {
    TENDERLY_TEMP_PROJECT: string;
    TENDERLY_USERNAME: string;
    TENDERLY_ACCESS_KEY: string;
}

const { TENDERLY_TEMP_PROJECT, TENDERLY_USERNAME, TENDERLY_ACCESS_KEY }: EnvOptions = process.env as any as EnvOptions;

before(async () => {
    if (!isTenderlyFork()) {
        return;
    }

    await createTenderlyFork(TENDERLY_TEMP_PROJECT);
});

after(async () => {
    const forkId = getForkId();

    console.log(`Deleting temporary fork: ${forkId}`);
    console.log();

    return axios.delete(
        `https://api.tenderly.co/api/v1/account/${TENDERLY_USERNAME}/project/${TENDERLY_TEMP_PROJECT}/fork/${forkId}`,
        {
            headers: {
                'X-Access-Key': TENDERLY_ACCESS_KEY as string
            }
        }
    );
});
