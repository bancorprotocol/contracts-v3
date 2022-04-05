import { ProxyAdmin } from '../../components/Contracts';
import { NetworkSettingsV1 } from '../../components/LegacyContractsV3';
import { DeployedContracts, DeploymentTag } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682501-network-settings', DeploymentTag.NetworkSettingsV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let networkSettings: NetworkSettingsV1;

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
