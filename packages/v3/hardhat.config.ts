import './test/Setup.ts';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-solhint';
import '@nomiclabs/hardhat-waffle';
import '@tenderly/hardhat-tenderly';
import '@typechain/hardhat';
import 'hardhat-abi-exporter';
import 'hardhat-contract-sizer';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';
import { HardhatUserConfig } from 'hardhat/config';
import { NetworkUserConfig } from 'hardhat/types';
import { MochaOptions } from 'mocha';
import 'solidity-coverage';

export const getEnvKey = <T>(envKeyName: string) => {
    return process.env[envKeyName] as unknown as T;
};

const mochaOptions = (): MochaOptions => {
    const ci = getEnvKey<boolean>('CI');
    const profile = getEnvKey<boolean>('PROFILE');

    let timeout = 600000;
    let grep;
    let invert = false;
    let reporter;

    if (profile) {
        // if we're profiling, make sure to only run @profile tests without any timeout restriction, and silence most
        // of test output
        timeout = 0;
        grep = '@profile';
        reporter = 'mocha-silent-reporter';
    } else if (ci) {
        // if we're running in CI, run all the tests
        grep = '';
    } else {
        // if we're running in dev, filter out stress and profile tests
        grep = '@stress|@profile';
        invert = true;
    }

    return {
        timeout,
        color: true,
        bail: getEnvKey('BAIL'),
        grep,
        invert,
        reporter
    };
};

const config: HardhatUserConfig = {
    networks: {
        hardhat: {
            accounts: {
                count: 10,
                accountsBalance: '10000000000000000000000000000000000000000000000'
            },
            allowUnlimitedContractSize: true
        },
        localhost: { url: 'http://localhost:8545', chainId: 31337 }
    },

    solidity: {
        compilers: [
            {
                version: '0.8.10',
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
            '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol',
            '@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol'
        ]
    },

    etherscan: {
        apiKey: ''
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

    mocha: mochaOptions()
};

export default config;
