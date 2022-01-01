import { NamedAccounts, ExternalContracts } from './deployments/data';
import './test/Setup.ts';
import { Networks } from './utils/Constants';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-solhint';
import '@nomiclabs/hardhat-waffle';
import '@tenderly/hardhat-tenderly';
import '@typechain/hardhat';
import 'dotenv/config';
import 'hardhat-contract-sizer';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';
import { HardhatUserConfig } from 'hardhat/config';
import { MochaOptions } from 'mocha';
import 'solidity-coverage';

interface EnvOptions {
    CI?: boolean;
    PROFILE?: boolean;
    BAIL?: boolean;
    ETHEREUM_PROVIDER_URL: string;
    ETHERSCAN_API_KEY?: string;
}

const {
    CI: isCI,
    PROFILE: isProfiling,
    BAIL,
    ETHEREUM_PROVIDER_URL = '',
    ETHERSCAN_API_KEY
}: EnvOptions = process.env as any as EnvOptions;

const mochaOptions = (): MochaOptions => {
    let timeout = 600000;
    let grep;
    let invert = false;
    let reporter;

    if (isProfiling) {
        // if we're profiling, make sure to only run @profile tests without any timeout restriction, and silence most
        // of test output
        timeout = 0;
        grep = '@profile';
        reporter = 'mocha-silent-reporter';
    } else if (isCI) {
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
        bail: BAIL,
        grep,
        invert,
        reporter
    };
};

const config: HardhatUserConfig = {
    networks: {
        [Networks.HARDHAT]: {
            accounts: {
                count: 10,
                accountsBalance: '10000000000000000000000000000000000000000000000'
            },
            allowUnlimitedContractSize: true,
            saveDeployments: false,
            live: false
        },
        [Networks.HARDHAT_MAINNET_FORK]: {
            url: ETHEREUM_PROVIDER_URL,
            forking: {
                enabled: true,
                url: ETHEREUM_PROVIDER_URL,
                blockNumber: 13900000
            },
            saveDeployments: false,
            live: true
        },
        [Networks.LOCALHOST]: { chainId: 31337, url: 'http://127.0.0.1:8545', saveDeployments: false, live: false },
        [Networks.MAINNET]: {
            chainId: 1,
            url: ETHEREUM_PROVIDER_URL,
            saveDeployments: true,
            live: true
        }
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
        paths: ['@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol']
    },

    namedAccounts: NamedAccounts,
    external: ExternalContracts,

    contractSizer: {
        alphaSort: true,
        runOnCompile: false,
        disambiguatePaths: false
    },

    etherscan: {
        apiKey: ETHERSCAN_API_KEY
    },

    mocha: mochaOptions()
};

export default config;
