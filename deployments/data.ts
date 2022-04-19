import { DeploymentNetwork, ZERO_ADDRESS } from '../utils/Constants';

interface EnvOptions {
    FORKING?: boolean;
}

const { FORKING: isForking }: EnvOptions = process.env as any as EnvOptions;

const counters = {
    [DeploymentNetwork.Hardhat]: 0,
    [DeploymentNetwork.Localhost]: 0
};

const mainnet = (address: string, fallback?: string) => ({
    [DeploymentNetwork.Hardhat]: isForking ? address : fallback || counters[DeploymentNetwork.Hardhat]++,
    [DeploymentNetwork.Localhost]: isForking ? address : fallback || counters[DeploymentNetwork.Localhost]++,
    [DeploymentNetwork.Mainnet]: address,
    [DeploymentNetwork.Tenderly]: address
});

const rinkeby = (address: string) => ({
    [DeploymentNetwork.Rinkeby]: address
});

const TestNamedAccounts = {
    ethWhale: {
        ...mainnet('0xda9dfa130df4de4673b89022ee50ff26f6ea73cf'),
        ...rinkeby('0x42EB768f2244C8811C63729A21A3569731535f06')
    },
    daiWhale: {
        ...mainnet('0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503'),
        ...rinkeby('0x91169dbb45e6804743f94609de50d511c437572e')
    },
    linkWhale: {
        ...mainnet('0xc6bed363b30df7f35b601a5547fe56cd31ec63da'),
        ...rinkeby('0xfed4ddb595f42a5dbf48b9f318ad9b8e2685c27b')
    },
    bntWhale: {
        ...mainnet('0xf977814e90da44bfa03b6295a0616a897441acec')
    }
};

const TokenNamedAccounts = {
    dai: {
        ...mainnet('0x6b175474e89094c44da98b954eedeac495271d0f'),
        ...rinkeby('0x6A9865aDE2B6207dAAC49f8bCba9705dEB0B0e6D')
    },
    link: {
        ...mainnet('0x514910771AF9Ca656af840dff83E8264EcF986CA'),
        ...rinkeby('0x01be23585060835e02b77ef475b0cc51aa1e0709')
    }
};

const LegacyNamedAccounts = {
    liquidityProtection: { ...mainnet('0x853c2D147a1BD7edA8FE0f58fb3C5294dB07220e', ZERO_ADDRESS) },
    legacyStakingRewards: { ...mainnet('0x318fEA7e45A7D3aC5999DA7e1055F5982eEB3E67', ZERO_ADDRESS) }
};

const UniswapNamedAccounts = {
    uniswapV2Router02: { ...mainnet('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D') },
    uniswapV2Factory: { ...mainnet('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f') }
};

const SushiSwapNamedAccounts = {
    sushiSwapRouter: { ...mainnet('0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F') },
    sushiSwapFactory: { ...mainnet('0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac') }
};

export const NamedAccounts = {
    deployer: {
        ...mainnet('ledger://0x5bEBA4D3533a963Dedb270a95ae5f7752fA0Fe22'),
        ...rinkeby('ledger://0x0f28D58c00F9373C00811E9576eE803B4eF98abe')
    },
    deployerV2: { ...mainnet('0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E') },
    foundationMultisig: { ...mainnet('0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83') },
    daoMultisig: { ...mainnet('0x7e3692a6d8c34a762079fa9057aed87be7e67cb8') },

    ...LegacyNamedAccounts,
    ...TokenNamedAccounts,
    ...TestNamedAccounts,
    ...UniswapNamedAccounts,
    ...SushiSwapNamedAccounts
};

export const ExternalContracts = {
    contracts: [
        {
            artifacts: 'node_modules/@bancor/contracts-solidity/artifacts'
        },
        {
            artifacts: 'node_modules/@bancor/token-governance/artifacts'
        }
    ],
    deployments: {
        [DeploymentNetwork.Hardhat]: [
            `deployments/${isForking ? DeploymentNetwork.Mainnet : DeploymentNetwork.Hardhat}`
        ],
        [DeploymentNetwork.Localhost]: [
            `deployments/${isForking ? DeploymentNetwork.Mainnet : DeploymentNetwork.Localhost}`
        ]
    }
};
