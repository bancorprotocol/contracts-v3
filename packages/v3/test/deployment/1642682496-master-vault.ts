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

        await expectRoles(masterVault, Roles.MasterVault);

        await expectRole(masterVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer]);
        await expectRole(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
        await expectRole(masterVault, Roles.MasterVault.ROLE_NETWORK_TOKEN_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
    });
});
