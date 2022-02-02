import { DeploymentNetwork, ZERO_ADDRESS } from '../utils/Constants';

interface EnvOptions {
    FORKING?: boolean;
}

const { FORKING: isForking }: EnvOptions = process.env as any as EnvOptions;

const TestNamedAccounts = {
    ethWhale: {
        [DeploymentNetwork.HARDHAT]: '0xda9dfa130df4de4673b89022ee50ff26f6ea73cf'
    }
};

let counter = 0;
const mainnet = (address: string, fallback?: string) => ({
    [DeploymentNetwork.HARDHAT]: isForking ? address : fallback || counter++,
    [DeploymentNetwork.MAINNET]: address
});

const LegacyNamedAccounts = {
    liquidityProtection: { ...mainnet('0x853c2D147a1BD7edA8FE0f58fb3C5294dB07220e', ZERO_ADDRESS) },
    stakingRewards: { ...mainnet('0x318fEA7e45A7D3aC5999DA7e1055F5982eEB3E67', ZERO_ADDRESS) }
};

export const NamedAccounts = {
    deployer: { ...mainnet('0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E') },
    foundationMultisig: { ...mainnet('0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83') },
    daoMultisig: { ...mainnet('0x7e3692a6d8c34a762079fa9057aed87be7e67cb8') },
    ...LegacyNamedAccounts,
    ...TestNamedAccounts
};

export const ExternalContracts = {
    contracts: [
        {
            artifacts: '../v2/artifacts'
        },
        {
            artifacts: 'node_modules/@bancor/token-governance/artifacts'
        }
    ],
    deployments: {
        [DeploymentNetwork.HARDHAT]: [
            `deployments/${isForking ? DeploymentNetwork.MAINNET : DeploymentNetwork.HARDHAT}`
        ]
    }
};
