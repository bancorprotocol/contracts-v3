import { BancorPortal, ProxyAdmin } from '../../components/Contracts';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let bancorPortal: BancorPortal;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        bancorPortal = await DeployedContracts.BancorPortal.deployed();
    });

    it('should deploy and configure the bancor portal contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(bancorPortal.address)).to.equal(proxyAdmin.address);

        expect(await bancorPortal.version()).to.equal(1);

        await expectRoleMembers(bancorPortal, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
