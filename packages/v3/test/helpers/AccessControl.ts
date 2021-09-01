import { AccessControlUpgradeable } from '../../typechain';
import { expect } from 'chai';
import { utils, BigNumber } from 'ethers';

const { id } = utils;

export const roles = {
    BancorVault: {
        ROLE_ADMIN: id('ROLE_ADMIN'),
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER'),
        ROLE_NETWORK_TOKEN_MANAGER: id('ROLE_NETWORK_TOKEN_MANAGER')
    },

    TokenGovernance: {
        ROLE_GOVERNOR: id('ROLE_GOVERNOR'),
        ROLE_MINTER: id('ROLE_MINTER')
    }
};

const roleNames = Object.values(roles)
    .map((contractRoles) => Object.values(contractRoles))
    .flat(1);

export const expectRole = async (
    contract: AccessControlUpgradeable,
    role: typeof roleNames[number],
    adminRole: string,
    initialMembers: string[] = []
) => {
    expect(await contract.getRoleAdmin(role)).to.equal(adminRole);
    expect(await contract.getRoleMemberCount(role)).to.equal(BigNumber.from(initialMembers?.length));

    for (const initialMember of initialMembers) {
        expect(await contract.hasRole(role, initialMember)).to.be.true;
    }
};
