import { MasterVault, ProxyAdmin } from '../../components/Contracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682496-master-vault', () => {
    let deployer: string;
    let proxyAdmin: ProxyAdmin;
    let masterVault: MasterVault;

    before(async () => {
        ({ deployer } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.MasterVault);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
    });

    it('should deploy and configure the master vault contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(masterVault.address)).to.equal(proxyAdmin.address);

        expect(await masterVault.version()).to.equal(1);
        expect(await masterVault.isPayable()).to.be.true;

        await expectRoles(masterVault, Roles.MasterVault);

        // during the initial deployment, only the deployer will have the ROLE_ADMIN role (which will be revoked in a
        // future deployment, that will revoke it and grant additional roles to the network and the master pool
        // contracts)
        await expectRole(masterVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRole(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
        await expectRole(masterVault, Roles.MasterVault.ROLE_NETWORK_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
    });
});
