import { DeploymentNetwork, ZERO_ADDRESS } from '../utils/Constants';

interface EnvOptions {
    FORKING?: boolean;
}

const { FORKING: isForking }: EnvOptions = process.env as any as EnvOptions;

let counter = 0;
const mainnet = (address: string, fallback?: string) => ({
    [DeploymentNetwork.Hardhat]: isForking ? address : fallback || counter++,
    [DeploymentNetwork.Mainnet]: address,
    [DeploymentNetwork.Tenderly]: address
});

const TestNamedAccounts = {
    ethWhale: { ...mainnet('0xda9dfa130df4de4673b89022ee50ff26f6ea73cf', ZERO_ADDRESS) },
    linkWhale: { ...mainnet('0xc6bed363b30df7f35b601a5547fe56cd31ec63da', ZERO_ADDRESS) },
    daiWhale: { ...mainnet('0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503', ZERO_ADDRESS) }
};

const TokenNamedAccounts = {
    dai: { ...mainnet('0x6b175474e89094c44da98b954eedeac495271d0f') },
    link: { ...mainnet('0x514910771AF9Ca656af840dff83E8264EcF986CA') }
};

const LegacyNamedAccounts = {
    liquidityProtection: { ...mainnet('0x853c2D147a1BD7edA8FE0f58fb3C5294dB07220e', ZERO_ADDRESS) },
    stakingRewards: { ...mainnet('0x318fEA7e45A7D3aC5999DA7e1055F5982eEB3E67', ZERO_ADDRESS) }
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
    deployer: { ...mainnet('0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E') },
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
        ]
    }
};
