import { Networks } from '../utils/Constants';

export const NamedAccounts = {
    deployer: {
        [Networks.HARDHAT]: 0,
        [Networks.MAINNET]: '0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E',
        [Networks.HARDHAT_MAINNET_FORK]: '0xdfeE8DC240c6CadC2c7f7f9c257c259914dEa84E'
    },
    foundationMultisig: {
        [Networks.HARDHAT]: 1,
        [Networks.MAINNET]: '0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83',
        [Networks.HARDHAT_MAINNET_FORK]: '0xeBeD45Ca22fcF70AdCcAb7618C51A3Dbb06C8d83'
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
        [Networks.HARDHAT_MAINNET_FORK]: [`deployments/${Networks.MAINNET}`]
    }
};
