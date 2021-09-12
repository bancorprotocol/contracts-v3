import './migration';
import fs from 'fs';
import path from 'path';

const configPath = path.join(__dirname, '/config.json');
const configFile = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

export const configFileNetworks = configFile.networks;

// Utilities
export const loadKey = (keyName: string) => {
    return configFile.keys ? configFile.keys[keyName] || undefined : undefined;
};

export const getNetworkUrl = (networkName: string) => {
    return configFile.networks
        ? configFile.networks[networkName]
            ? configFile.networks[networkName].url || undefined
            : undefined
        : undefined;
};

export const getEnvKey = <T>(envKeyName: string) => {
    return process.env[envKeyName] as unknown as T;
};

// Forking configuration
export const FORK_PREFIX = 'fork-';
export const FORK_CONFIG = (() => {
    const networkToFork: string = getEnvKey('FORK');
    if (!networkToFork) {
        return undefined;
    }

    const urlNetworkToFork: string = getNetworkUrl(networkToFork);
    if (!urlNetworkToFork) {
        console.log(`${networkToFork} config is not present in the config.json file, aborting.`);
        process.exit(-1);
    }

    const FORKED_NETWORK_NAME = FORK_PREFIX + networkToFork;
    return {
        networkName: FORKED_NETWORK_NAME,
        networkUrl: urlNetworkToFork
    };
})();

export const hardhatForkedConfig = FORK_CONFIG
    ? {
          forking: {
              url: FORK_CONFIG.networkUrl
          }
      }
    : undefined;
