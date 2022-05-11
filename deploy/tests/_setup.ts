import { isTenderlyFork } from '../../utils/Deploy';
import axios from 'axios';
import { config, network, tenderly } from 'hardhat';
import { HttpNetworkUserConfig } from 'hardhat/types';

interface EnvOptions {
    TENDERLY_TEMP_PROJECT: string;
    TENDERLY_USERNAME: string;
    TENDERLY_ACCESS_KEY: string;
}

const { TENDERLY_TEMP_PROJECT, TENDERLY_USERNAME, TENDERLY_ACCESS_KEY }: EnvOptions = process.env as any as EnvOptions;

const tenderlyNetwork = tenderly.network();
let forkId: string;

const createTempTenderlyFork = async (projectName: string) => {
    config.tenderly.project = projectName;

    await tenderlyNetwork.initializeFork();

    forkId = tenderlyNetwork.getFork()!;
    console.log(`Created temporary fork: ${forkId}`);
    console.log();

    const networkConfig = network.config as HttpNetworkUserConfig;
    networkConfig.url = `https://rpc.tenderly.co/fork/${forkId}`;
};

before(async () => {
    if (!isTenderlyFork()) {
        return;
    }

    await createTempTenderlyFork(TENDERLY_TEMP_PROJECT);
});

after(async () => {
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
