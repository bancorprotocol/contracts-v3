import { DeploymentNetwork } from '../utils/Constants';

const LegacyNamedAccounts = {
    liquidityProtection: {
        [DeploymentNetwork.MAINNET]: '0x853c2D147a1BD7edA8FE0f58fb3C5294dB07220e',
        [DeploymentNetwork.HARDHAT_MAINNET_FORK]: '0x853c2D147a1BD7edA8FE0f58fb3C5294dB07220e'
    },
    stakingRewards: {
        [DeploymentNetwork.MAINNET]: '0x318fEA7e45A7D3aC5999DA7e1055F5982eEB3E67',
        [DeploymentNetwork.HARDHAT_MAINNET_FORK]: '0x318fEA7e45A7D3aC5999DA7e1055F5982eEB3E67'
    }
};

export const NamedAccounts = {
    ...LegacyNamedAccounts,
    deployer: {
        [DeploymentNetwork.HARDHAT]: 0,
        [DeploymentNetwork.MAINNET]: '0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E',
        [DeploymentNetwork.HARDHAT_MAINNET_FORK]: '0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E'
    },
    foundationMultisig: {
        [DeploymentNetwork.HARDHAT]: 1,
        [DeploymentNetwork.MAINNET]: '0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83',
        [DeploymentNetwork.HARDHAT_MAINNET_FORK]: '0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83'
    },
    daoMultisig: {
        [DeploymentNetwork.HARDHAT]: 2,
        [DeploymentNetwork.MAINNET]: '0x7e3692a6d8c34a762079fa9057aed87be7e67cb8',
        [DeploymentNetwork.HARDHAT_MAINNET_FORK]: '0x7e3692a6d8c34a762079fa9057aed87be7e67cb8'
    }
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
        [DeploymentNetwork.HARDHAT_MAINNET_FORK]: [`deployments/${DeploymentNetwork.MAINNET}`]
    }
};
