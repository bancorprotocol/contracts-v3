import { BancorNetwork, ExternalProtectionVault, MasterVault, ProxyAdmin } from '../../components/Contracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682506-network', () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let network: BancorNetwork;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.BancorNetwork);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        network = await DeployedContracts.BancorNetwork.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    });

    it('should deploy and configure the network contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(network.address)).to.equal(proxyAdmin.address);

        expect(await network.version()).to.equal(1);

        await expectRoles(network, Roles.BancorNetwork);

        await expectRole(network, Roles.BancorNetwork.ROLE_MIGRATION_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
        await expectRole(network, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer]);

        await expectRole(masterVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
            deployer,
            network.address
        ]);
        await expectRole(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [network.address]);
        await expectRole(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
            deployer,
            network.address
        ]);
        await expectRole(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN, [
            network.address
        ]);
    });
});
