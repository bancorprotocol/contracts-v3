import { BancorPortal, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { Roles, expectRoleMembers } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682514-bancor-portal', ContractName.BancorPortalV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let bancorPortal: BancorPortal;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        bancorPortal = await DeployedContracts.BancorPortalV1.deployed();
    });

    it('should deploy and configure the bancor portal contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(bancorPortal.address)).to.equal(proxyAdmin.address);
        expect(await bancorPortal.version()).to.equal(1);
        await expectRoleMembers(bancorPortal, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
