import { ExternalContracts, NamedAccounts } from './deployments/data';
import './test/Setup';
import { DeploymentNetwork } from './utils/Constants';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-solhint';
import '@nomiclabs/hardhat-waffle';
import '@tenderly/hardhat-tenderly';
import '@typechain/hardhat';
import 'dotenv/config';
import 'hardhat-contract-sizer';
import 'hardhat-dependency-compiler';
import 'hardhat-deploy';
import 'hardhat-watcher';
import { HardhatUserConfig } from 'hardhat/config';
import { MochaOptions } from 'mocha';
import 'solidity-coverage';

interface EnvOptions {
    ETHEREUM_PROVIDER_URL?: string;
    ETHEREUM_RINKEBY_PROVIDER_URL?: string;
    ETHERSCAN_API_KEY?: string;
    GAS_PRICE?: number | 'auto';
    NIGHTLY?: boolean;
    PROFILE?: boolean;
    TENDERLY_FORK_ID?: string;
    TENDERLY_PROJECT?: string;
    TENDERLY_TEST_PROJECT?: string;
    TENDERLY_USERNAME?: string;
}

const {
    ETHEREUM_PROVIDER_URL = '',
    ETHEREUM_RINKEBY_PROVIDER_URL = '',
    ETHERSCAN_API_KEY,
    GAS_PRICE: gasPrice = 'auto',
    NIGHTLY: isNightly,
    PROFILE: isProfiling,
    TENDERLY_FORK_ID = '',
    TENDERLY_PROJECT = '',
    TENDERLY_TEST_PROJECT = '',
    TENDERLY_USERNAME = ''
}: EnvOptions = process.env as any as EnvOptions;

const mochaOptions = (): MochaOptions => {
    let timeout = 600000;
    let grep;
    let reporter;
    let invert = false;

    if (isProfiling) {
        // if we're profiling, make sure to only run @profile tests without any timeout restriction, and silence most
        // of test output
        timeout = 0;
        grep = '@profile';
        reporter = 'mocha-silent-reporter';
    } else if (isNightly) {
        // if we're running the nightly CI test, run all the tests
        grep = '';
    } else {
        // if we're running in dev, filter out stress and profile tests
        grep = '@profile|@stress';
        invert = true;
    }

    return {
        timeout,
        color: true,
        bail: true,
        grep,
        invert,
        reporter
    };
};

const config: HardhatUserConfig = {
    networks: {
        [DeploymentNetwork.Hardhat]: {
            accounts: {
                count: 20,
                accountsBalance: '10000000000000000000000000000000000000000000000'
            },
            allowUnlimitedContractSize: true,
            saveDeployments: false,
            live: false
        },
        [DeploymentNetwork.Mainnet]: {
            chainId: 1,
            url: ETHEREUM_PROVIDER_URL,
            gasPrice,
            saveDeployments: true,
            live: true
        },
        [DeploymentNetwork.Rinkeby]: {
            chainId: 4,
            url: ETHEREUM_RINKEBY_PROVIDER_URL,
            saveDeployments: true,
            live: true
        },
        [DeploymentNetwork.Tenderly]: {
            chainId: 1,
            url: `https://rpc.tenderly.co/fork/${TENDERLY_FORK_ID}`,
            autoImpersonate: true,
            saveDeployments: true,
            live: true
        }
    },

    paths: {
        deploy: ['deploy/scripts']
    },

    tenderly: {
        forkNetwork: '1',
        project: TENDERLY_PROJECT || TENDERLY_TEST_PROJECT,
        username: TENDERLY_USERNAME
    },

    solidity: {
        compilers: [
            {
                version: '0.8.13',
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

    verify: {
        etherscan: {
            apiKey: ETHERSCAN_API_KEY
        }
    },

    watcher: {
        test: {
            tasks: [{ command: 'test' }],
            files: ['./test/**/*', './contracts/**/*', './deploy/**/*'],
            verbose: true
        }
    },

    mocha: mochaOptions()
};

export default config;
