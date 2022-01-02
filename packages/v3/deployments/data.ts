import { DeploymentNetwork } from '../utils/Constants';

export const NamedAccounts = {
    deployer: {
        [DeploymentNetwork.HARDHAT]: 0,
        [DeploymentNetwork.MAINNET]: '0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E',
        [DeploymentNetwork.HARDHAT_MAINNET_FORK]: '0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E'
    },
    foundationMultisig: {
        [DeploymentNetwork.HARDHAT]: 1,
        [DeploymentNetwork.MAINNET]: '0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83',
        [DeploymentNetwork.HARDHAT_MAINNET_FORK]: '0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83'
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
