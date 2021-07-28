import './migration/engine';
import { log } from './migration/engine/logger/logger';
import { customChai } from './test/matchers';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import chai from 'chai';
import { BigNumber } from 'ethers';
import fs from 'fs';
import 'hardhat-abi-exporter';
import 'hardhat-contract-sizer';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import { HardhatUserConfig } from 'hardhat/config';
import path from 'path';
import 'solidity-coverage';
import 'tsconfig-paths/register';

chai.use(customChai);

const configPath = path.join(__dirname, '/config.json');
const configFile = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

// Utilities
const loadKey = (keyName: string) => {
    return configFile.keys ? (configFile.keys[keyName] ? configFile.keys[keyName] : undefined) : undefined;
};
const loadNetworkUrl = (networkName: string) => {
    return configFile.networks
        ? configFile.networks[networkName]
            ? configFile.networks[networkName].url
                ? configFile.networks[networkName].url
                : undefined
            : undefined
        : undefined;
};
const loadENV = <T>(envKeyName: string) => {
    return process.env[envKeyName] as unknown as T;
};

// Forking configuration
export const FORK_PREFIX = 'fork-';

const MAINNET = 'mainnet';

type FORK_NETWORK_SUPPORTED = typeof MAINNET;

export const FORK_CONFIG = (() => {
    const networkToFork: string = loadENV<FORK_NETWORK_SUPPORTED>('FORK');
    const urlNetworkToFork: string = loadNetworkUrl(networkToFork);

    if (networkToFork && !urlNetworkToFork) {
        log.error(`${networkToFork} config is not present in the config.json file, aborting.`);
        process.exit(-1);
    }

    if (!networkToFork && !urlNetworkToFork) {
        return undefined;
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
    gasPrice: 20000000000,
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
        enabled: loadENV('PROFILE')
    },

    mocha: {
        timeout: 600000,
        color: true,
        bail: loadENV('BAIL')
    }
};

export default config;

declare module 'ethers' {
    class BigNumber {
        static min(a: any, b: any): boolean;
        static max(a: any, b: any): boolean;
    }
}

BigNumber.min = (a: any, b: any) => (BigNumber.from(a).gt(b) ? b : a);
BigNumber.max = (a: any, b: any) => (BigNumber.from(a).gt(b) ? a : b);
