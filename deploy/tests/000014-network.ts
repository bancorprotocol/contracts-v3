import { ExternalProtectionVault, MasterVault, ProxyAdmin } from '../../components/Contracts';
import { BancorNetworkV1 } from '../../components/LegacyContractsV3';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let network: BancorNetworkV1;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        network = await DeployedContracts.BancorNetworkV1.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    });

    it('should deploy and configure the network contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(network.address)).to.equal(proxyAdmin.address);

        expect(await network.version()).to.equal(1);

        await expectRoleMembers(network, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(masterVault, Roles.Upgradeable.ROLE_ADMIN, [deployer, network.address]);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER);
        await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [network.address]);
        await expectRoleMembers(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, [deployer, network.address]);
        await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [network.address]);
    });
});
