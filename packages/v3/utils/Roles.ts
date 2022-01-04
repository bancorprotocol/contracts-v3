import { utils } from 'ethers';

const { id } = utils;

export const Roles = {
    Upgradeable: {
        ROLE_ADMIN: id('ROLE_ADMIN')
    },

    BancorNetwork: {
        ROLE_MIGRATION_MANAGER: id('ROLE_MIGRATION_MANAGER')
    },

    MasterVault: {
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER'),
        ROLE_NETWORK_TOKEN_MANAGER: id('ROLE_NETWORK_TOKEN_MANAGER')
    },

    ExternalProtectionVault: {
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER')
    },

    ExternalRewardsVault: {
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER')
    },

    NetworkFeeVault: {
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER')
    },

    MasterPool: {
        ROLE_MASTER_POOL_TOKEN_MANAGER: id('ROLE_MASTER_POOL_TOKEN_MANAGER'),
        ROLE_NETWORK_TOKEN_MANAGER: id('ROLE_NETWORK_TOKEN_MANAGER'),
        ROLE_VAULT_MANAGER: id('ROLE_VAULT_MANAGER'),
        ROLE_FUNDING_MANAGER: id('ROLE_FUNDING_MANAGER')
    },

    TokenGovernance: {
        ROLE_SUPERVISOR: id('ROLE_SUPERVISOR'),
        ROLE_GOVERNOR: id('ROLE_GOVERNOR'),
        ROLE_MINTER: id('ROLE_MINTER')
    }
};
