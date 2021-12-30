import { AccessControlEnumerable, AccessControlEnumerableUpgradeable } from '../../typechain-types';
import { Roles } from '../../utils/Roles';
import { expect } from 'chai';

export * from '../../utils/Roles';

const roleNames = Object.values(Roles)
    .map((contractRoles) => Object.values(contractRoles))
    .flat(1);

export const expectRole = async (
    contract: AccessControlEnumerableUpgradeable | AccessControlEnumerable,
    role: typeof roleNames[number],
    adminRole: string,
    initialMembers: string[] = []
) => {
    expect(await contract.getRoleAdmin(role)).to.equal(adminRole);
    expect(await contract.getRoleMemberCount(role)).to.equal(initialMembers?.length);

    for (const initialMember of initialMembers) {
        expect(await contract.hasRole(role, initialMember)).to.be.true;
    }
};
