import { AccessControlEnumerableUpgradeable } from '../../typechain';
import { expect } from 'chai';
import { utils, BigNumber } from 'ethers';

const { id } = utils;

export const roles = {
    Upgradeable: {
        ROLE_ADMIN: id('ROLE_ADMIN')
    },

    BancorVault: {
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER'),
        ROLE_NETWORK_TOKEN_MANAGER: id('ROLE_NETWORK_TOKEN_MANAGER')
    },

    ExternalProtectionVault: {
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER')
    },

    ExternalRewardsVault: {
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER')
    },

    TokenGovernance: {
        ROLE_GOVERNOR: id('ROLE_GOVERNOR'),
        ROLE_MINTER: id('ROLE_MINTER')
    }
};

export const mapHashToRole = (() => {
    const roleMap: { [roleCategory: string]: string } = {};

    for (var roleCategory of Object.keys(roles)) {
        const rolesInCategory = Object.keys((roles as any)[roleCategory]);

        for (var roleInCategory of rolesInCategory) {
            roleMap[id(roleInCategory)] = roleInCategory;
        }
    }

    return roleMap;
})();

export const expectRole = async (
    contract: AccessControlEnumerableUpgradeable,
    role: string,
    adminRole: string,
    initialMembers: string[] = []
) => {
    expect(await contract.getRoleAdmin(role)).to.equal(adminRole);
    expect(await contract.getRoleMemberCount(role)).to.equal(BigNumber.from(initialMembers?.length));

    for (const initialMember of initialMembers) {
        expect(await contract.hasRole(role, initialMember)).to.be.true;
    }
};
