import { expect } from 'chai';
import { ethers } from 'ethers';
import { BigNumber } from 'ethers';

import { AccessControlUpgradeable } from 'typechain';

const {
    utils: { id }
} = ethers;

export const roles = {
    BancorVault: {
        ROLE_ADMIN: id('ROLE_ADMIN'),
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER'),
        ROLE_NETWORK_TOKEN_MANAGER: id('ROLE_NETWORK_TOKEN_MANAGER')
    }
};

interface AccessListRole {
    role: string;
    adminRole: string;
    initMemberCount: number;
    initialMember?: string;
}

export const expectAccessList = async (contract: AccessControlUpgradeable, roles: AccessListRole[]) => {
    for (const role of roles) {
        const { role: name, adminRole, initMemberCount, initialMember } = role;
        expect(await contract.getRoleAdmin(name)).to.equal(adminRole);
        expect(await contract.getRoleMemberCount(name)).to.equal(BigNumber.from(initMemberCount));

        if (initMemberCount > 0 && initialMember) {
            expect(await contract.hasRole(name, initialMember)).to.be.true;
        }
    }
};
