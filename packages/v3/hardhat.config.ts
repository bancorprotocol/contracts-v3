import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
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
import './migration/engine';

const configPath = path.join(__dirname, 'config.json');
const configFile = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

export const loadKey = (keyName: string) => {
    return configFile.keys ? (configFile.keys[keyName] ? configFile.keys[keyName] : undefined) : undefined;
};

export const loadENV = <T>(envKeyName: string) => {
    return process.env[envKeyName] as unknown as T;
};

const hardhatDefaultConfig = {
    gasPrice: 20000000000,
    gas: 9500000,
    accounts: {
        count: 10,
        accountsBalance: '10000000000000000000000000000'
    }
};

const FORK_NETWORK = loadENV('FORK');
const FORK_NETWORK_URL = loadKey(`url-${FORK_NETWORK}`);

const hardhatForkedConfig = FORK_NETWORK
    ? FORK_NETWORK_URL
        ? {
              forking: {
                  url: FORK_NETWORK_URL
              }
          }
        : undefined
    : undefined;

const config: HardhatUserConfig = {
    networks: {
        hardhat: hardhatForkedConfig || hardhatDefaultConfig
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
