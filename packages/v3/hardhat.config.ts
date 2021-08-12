import './migration';
import { log } from './migration/engine/logger/logger';
import './test/Setup.ts';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import fs from 'fs';
import 'hardhat-abi-exporter';
import 'hardhat-contract-sizer';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import { HardhatUserConfig } from 'hardhat/config';
import path from 'path';
import 'solidity-coverage';

const configPath = path.join(__dirname, '/config.json');
const configFile = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

// Utilities
const loadKey = (keyName: string) => {
    return configFile.keys ? (configFile.keys[keyName] ? configFile.keys[keyName] : undefined) : undefined;
};
const getNetworkUrl = (networkName: string) => {
    return configFile.networks
        ? configFile.networks[networkName]
            ? configFile.networks[networkName].url
                ? configFile.networks[networkName].url
                : undefined
            : undefined
        : undefined;
};
const getEnvKey = <T>(envKeyName: string) => {
    return process.env[envKeyName] as unknown as T;
};

// Forking configuration
export const FORK_PREFIX = 'fork-';

const MAINNET = 'mainnet';

type FORK_NETWORK_SUPPORTED = typeof MAINNET;

export const FORK_CONFIG = (() => {
    const networkToFork: string = getEnvKey<FORK_NETWORK_SUPPORTED>('FORK');
    const urlNetworkToFork: string = getNetworkUrl(networkToFork);

    if (!networkToFork) {
        return undefined;
    }

    if (networkToFork && !urlNetworkToFork) {
        log.error(`${networkToFork} config is not present in the config.json file, aborting.`);
        process.exit(-1);
    }

    let FORKED_NETWORK_NAME: string = '';
    if (networkToFork === MAINNET) {
        FORKED_NETWORK_NAME = FORK_PREFIX + networkToFork;
    } else {
        log.error(`${networkToFork} is not supported, aborting.`);
        process.exit(-1);
    }

    return {
        networkName: FORKED_NETWORK_NAME,
        networkUrl: urlNetworkToFork
    };
})();

const hardhatDefaultConfig = {
    hardfork: 'london',
    gasPrice: 'auto',
    gas: 9500000,
    accounts: {
        count: 10,
        accountsBalance: '10000000000000000000000000000'
    }
};

const hardhatForkedConfig = FORK_CONFIG
    ? {
          forking: {
              url: FORK_CONFIG.networkUrl
          }
      }
    : undefined;

const ci = getEnvKey<boolean>('CI');

const config: HardhatUserConfig = {
    networks: {
        hardhat: hardhatForkedConfig || hardhatDefaultConfig,

        ...configFile.networks
    },

    solidity: {
        compilers: [
            {
                version: '0.7.6',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    },
                    metadata: {
                        bytecodeHash: 'none'
                    },
                    outputSelection: {
                        '*': {
                            '*': ['storageLayout'] // Enable slots, offsets and types of the contract's state variables
                        }
                    }
                }
            }
        ]
    },

    dependencyCompiler: {
        paths: [
            '@openzeppelin/contracts/proxy/ProxyAdmin.sol',
            '@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol'
        ]
    },

    etherscan: {
        apiKey: loadKey('etherscan')
    },

    contractSizer: {
        alphaSort: true,
        runOnCompile: false,
        disambiguatePaths: false
    },

    abiExporter: {
        path: './data/abi',
        clear: true
    },

    gasReporter: {
        currency: 'USD',
        enabled: getEnvKey('PROFILE')
    },

    mocha: {
        timeout: 600000,
        color: true,
        bail: getEnvKey('BAIL'),
        grep: ci ? '' : '@stress',
        invert: ci ? false : true
    }
};

export default config;
