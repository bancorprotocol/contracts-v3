import { BancorNetwork, ExternalProtectionVault, MasterVault, ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682506-network', ContractName.BancorNetworkV1, () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let network: BancorNetwork;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        network = await DeployedContracts.BancorNetworkV1.deployed();
        masterVault = await DeployedContracts.MasterVaultV1.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVaultV1.deployed();
    });

    it('should deploy and configure the network contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(network.address)).to.equal(proxyAdmin.address);

        expect(await network.version()).to.equal(1);

        await expectRoleMembers(network, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRoleMembers(masterVault, Roles.Upgradeable.ROLE_ADMIN, [deployer, network.address]);
        await expectRoleMembers(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER);
        await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [network.address]);
        await expectRoleMembers(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, [deployer, network.address]);
        await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [network.address]);
    });
});
