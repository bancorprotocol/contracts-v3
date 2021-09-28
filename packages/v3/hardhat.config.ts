import { getEnvKey, CONFIG, loadConfigFileKey } from './hardhat.extended.config';
import './migration';
import './test/Setup.ts';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@typechain/hardhat';
import 'hardhat-abi-exporter';
import 'hardhat-contract-sizer';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import { HardhatUserConfig } from 'hardhat/config';
import { NetworkUserConfig } from 'hardhat/types';
import 'solidity-coverage';

const hardhatDefaultConfig: NetworkUserConfig = {
    accounts: {
        count: 10,
        accountsBalance: '10000000000000000000000000000'
    },
    allowUnlimitedContractSize: true
};

const ci = getEnvKey<boolean>('CI');

const config: HardhatUserConfig = {
    networks: {
        hardhat: CONFIG.hardhatForkConfig?.hardhatConfig || hardhatDefaultConfig,

        ...CONFIG.networks
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
        apiKey: loadConfigFileKey('etherscan')
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
        invert: !ci
    }
};

export default config;
