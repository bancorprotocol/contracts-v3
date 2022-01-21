import { AccessControlEnumerable, AccessControlEnumerableUpgradeable } from '../../components/Contracts';
import { RoleIds } from '../../utils/Roles';
import { expect } from 'chai';
import { utils } from 'ethers';
import { camelCase } from 'lodash';

const { id } = utils;

export * from '../../utils/Roles';

export const expectRole = async (
    contract: AccessControlEnumerableUpgradeable | AccessControlEnumerable,
    roleId: typeof RoleIds[number],
    adminRole: string,
    members: string[] = []
) => {
    expect(await contract.getRoleAdmin(roleId)).to.equal(adminRole);
    expect(await contract.getRoleMemberCount(roleId)).to.equal(members?.length);

    for (const member of members) {
        expect(await contract.hasRole(roleId, member)).to.be.true;
    }
};

export const expectRoles = async (
    contract: AccessControlEnumerableUpgradeable | AccessControlEnumerable,
    roles: Record<string, typeof RoleIds[number]>
) => {
    const expectedRoles = Object.keys(roles).map((name) => ({ methodName: camelCase(name), id: id(name) }));

    for (const { methodName, id } of expectedRoles) {
        const method = (contract as any)[methodName] as () => Promise<any>;
        expect(await method()).to.equal(id);
    }
};
