import './test/Setup.ts';
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
    ETHEREUM_PROVIDER_URL,
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
        hardhat: {
            accounts: {
                count: 10,
                accountsBalance: '10000000000000000000000000000000000000000000000'
            },
            allowUnlimitedContractSize: true,
            saveDeployments: false,
            live: false
        },
        'hardhat-mainnet-fork': {
            url: ETHEREUM_PROVIDER_URL,
            forking: {
                enabled: true,
                url: ETHEREUM_PROVIDER_URL,
                blockNumber: 13900000
            },
            allowUnlimitedContractSize: true,
            saveDeployments: true,
            live: true
        },
        localhost: { chainId: 31337, url: 'http://localhost:8545', saveDeployments: false, live: false },
        mainnet: {
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

    contractSizer: {
        alphaSort: true,
        runOnCompile: false,
        disambiguatePaths: false
    },

    namedAccounts: {
        deployer: {
            hardhat: 0,
            mainnet: '0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E',
            'hardhat-mainnet-fork': '0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E'
        },
        foundationMultisig: {
            hardhat: 1,
            mainnet: '0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83',
            'hardhat-mainnet-fork': '0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83'
        }
    },

    external: {
        contracts: [
            {
                artifacts: '../v2/artifacts'
            },
            {
                artifacts: 'node_modules/@bancor/token-governance/artifacts'
            }
        ],
        deployments: {
            'hardhat-mainnet-fork': ['deployments/mainnet']
        }
    },

    etherscan: {
        apiKey: ETHERSCAN_API_KEY
    },

    mocha: mochaOptions()
};

export default config;
