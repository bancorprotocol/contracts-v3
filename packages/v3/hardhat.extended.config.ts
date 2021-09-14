import './migration';
import fs from 'fs';
import { HardhatNetworkUserConfig, NetworkUserConfig } from 'hardhat/types';
import path from 'path';

export type ConfigFile = {
    keys: { [key: string]: string };
    networks: { [key: string]: { url: string; defaultAccount: string } };
};

const defaultConfigFile = {
    keys: {},
    networks: {}
};

const configPath = path.join(__dirname, '/config.json');
const configFile: ConfigFile = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf8'))
    : defaultConfigFile;

// re-create hardhat-like configuration for networks from config file
export const configFileNetworks = (() => {
    const networks: { [networkName: string]: NetworkUserConfig | undefined } = {};
    for (const networkName in configFile.networks) {
        const defaultAccount = configFile.networks[networkName].defaultAccount;
        const accounts = defaultAccount ? [defaultAccount] : [];

        networks[networkName] = {
            url: configFile.networks[networkName].url,
            accounts: accounts
        };
    }
    return networks;
})();

// Utilities
export const getEnvKey = <T>(envKeyName: string) => {
    return process.env[envKeyName] as unknown as T;
};

export const loadConfigFileKey = (keyName: string) => {
    return configFile.keys[keyName] || undefined;
};

export const loadConfigFileNetwork = (networkName: string) => {
    return configFile.networks[networkName] || undefined;
};

export type hardhatForkConfig = {
    hardhatConfig: HardhatNetworkUserConfig;
    //
    networkName: string;
    networkUrl: string;
};

export const FORK_PREFIX = 'fork-';
export const MIGRATION_FORK_CONFIG: hardhatForkConfig | undefined = (() => {
    // if not migration then exit
    if (!getEnvKey('MIGRATION')) return undefined;

    // check if it's a fork
    const networkToFork: string = getEnvKey('FORK');

    // if it's not a fork, returns
    if (!networkToFork) return undefined;

    // if it is a fork, populate with the proper fork config
    const networkConfig = loadConfigFileNetwork(networkToFork);

    // check the forked network url
    if (!networkConfig?.url) {
        console.log(`${networkToFork} config is not present in the config.json file, aborting.`);
        process.exit(-1);
    }

    // get the default account of the forked network
    const defaultAccount = (() => {
        const networkConfig = configFile.networks[networkToFork];
        if (!networkConfig) return undefined;

        if (!networkConfig.defaultAccount) return undefined;

        return [{ privateKey: networkConfig.defaultAccount, balance: '10000000000000000000000000000' }];
    })();

    return {
        hardhatConfig: {
            accounts: defaultAccount,
            forking: {
                url: networkConfig.url
            }
        },
        networkName: FORK_PREFIX + networkToFork,
        networkUrl: networkConfig.url
    };
})();
