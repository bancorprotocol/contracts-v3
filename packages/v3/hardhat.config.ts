import fs from 'fs';
import path from 'path';

import { HardhatUserConfig } from 'hardhat/config';

import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';

import 'solidity-coverage';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-contract-sizer';
import 'hardhat-abi-exporter';
import 'hardhat-gas-reporter';

import chai from 'chai';
import { customChai } from './test/matchers';

chai.use(customChai);

const configPath = path.join(__dirname, '/config.json');
const configFile = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {};

const loadAPIKey = (apiKeyName: string) => {
    return configFile.apiKeys ? (configFile.apiKeys[apiKeyName] ? configFile.apiKeys[apiKeyName] : '') : '';
};

// Casting to unknown assume the good type is provided
const loadENVKey = <T>(envKeyName: string) => {
    return process.env[envKeyName] as unknown as T;
};

const configNetworks = configFile.networks || {};

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            gasPrice: 20000000000,
            gas: 9500000,
            accounts: {
                count: 10,
                accountsBalance: '10000000000000000000000000000'
            }
        },

        ...configNetworks
    },

    solidity: {
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
    },

    dependencyCompiler: {
        paths: [
            '@openzeppelin/contracts/proxy/ProxyAdmin.sol',
            '@openzeppelin/contracts/proxy/TransparentUpgradeableProxy.sol'
        ]
    },

    etherscan: {
        apiKey: loadAPIKey('etherscan')
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
        enabled: loadENVKey('PROFILE')
    },

    mocha: {
        timeout: 600000,
        color: true,
        bail: loadENVKey('BAIL')
    }
};

export default config;

// Patch BigNumber to include a min and a max functions.
import { BigNumber } from 'ethers';

declare module 'ethers' {
    class BigNumber {
        static min(a: any, b: any): boolean;
        static max(a: any, b: any): boolean;
    }
}

BigNumber.min = (a: any, b: any) => (BigNumber.from(a).gt(b) ? b : a);
BigNumber.max = (a: any, b: any) => (BigNumber.from(a).gt(b) ? a : b);
