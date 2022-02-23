import { utils } from 'ethers';

const { id } = utils;

export const Roles = {
    Upgradeable: {
        ROLE_ADMIN: id('ROLE_ADMIN')
    },

    BancorNetwork: {
        ROLE_MIGRATION_MANAGER: id('ROLE_MIGRATION_MANAGER'),
        ROLE_EMERGENCY_STOPPER: id('ROLE_EMERGENCY_STOPPER'),
        ROLE_NETWORK_FEE_MANAGER: id('ROLE_NETWORK_FEE_MANAGER')
    },

    MasterVault: {
        ROLE_BNT_MANAGER: id('ROLE_BNT_MANAGER')
    },

    BNTPool: {
        ROLE_BNT_POOL_TOKEN_MANAGER: id('ROLE_BNT_POOL_TOKEN_MANAGER'),
        ROLE_BNT_MANAGER: id('ROLE_BNT_MANAGER'),
        ROLE_VAULT_MANAGER: id('ROLE_VAULT_MANAGER'),
        ROLE_FUNDING_MANAGER: id('ROLE_FUNDING_MANAGER')
    },

    TokenGovernance: {
        ROLE_SUPERVISOR: id('ROLE_SUPERVISOR'),
        ROLE_GOVERNOR: id('ROLE_GOVERNOR'),
        ROLE_MINTER: id('ROLE_MINTER')
    },

    Vault: {
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER')
    }
};

export const RoleIds = Object.values(Roles)
    .map((contractRoles) => Object.values(contractRoles))
    .flat(1);
