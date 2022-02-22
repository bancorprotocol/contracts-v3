import { NetworkSettings, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { Roles, expectRoleMembers } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682501-network-settings', ContractName.NetworkSettingsV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let networkSettings: NetworkSettings;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        networkSettings = await DeployedContracts.NetworkSettingsV1.deployed();
    });

    it('should deploy and configure the network settings contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(networkSettings.address)).to.equal(proxyAdmin.address);

        expect(await networkSettings.version()).to.equal(1);

        await expectRoleMembers(networkSettings, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
    });
});
