import { BancorPortal } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let bancorPortal: BancorPortal;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        bancorPortal = await DeployedContracts.BancorPortal.deployed();
    });

    it('should upgrade the bancor portal contract', async () => {
        expect(await bancorPortal.version()).to.equal(2);

        await expectRoleMembers(bancorPortal, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
