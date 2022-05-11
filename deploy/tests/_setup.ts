import { createTenderlyFork, deleteTenderlyFork, getForkId, isTenderlyFork } from '../../utils/Deploy';

interface EnvOptions {
    TENDERLY_TEMP_PROJECT: string;
    TENDERLY_USERNAME: string;
    TENDERLY_ACCESS_KEY: string;
}

const { TENDERLY_TEMP_PROJECT }: EnvOptions = process.env as any as EnvOptions;

before(async () => {
    if (!isTenderlyFork()) {
        return;
    }

    await createTenderlyFork({ projectName: TENDERLY_TEMP_PROJECT });
});

after(async () => {
    console.log(`Deleting temporary fork: ${getForkId()}`);
    console.log();

    return deleteTenderlyFork({ projectName: TENDERLY_TEMP_PROJECT });
});
