import { ExternalProtectionVault, ProxyAdmin } from '../../components/Contracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682497-external-protection-vault', () => {
    let daoMultisig: string;
    let proxyAdmin: ProxyAdmin;
    let externalProtectionVault: ExternalProtectionVault;

    before(async () => {
        ({ daoMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.ExternalProtectionVault);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
    });

    it('should deploy and configure the external protection vault contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(externalProtectionVault.address)).to.equal(proxyAdmin.address);

        expect(await externalProtectionVault.version()).to.equal(1);
        expect(await externalProtectionVault.isPayable()).to.be.true;

        await expectRole(externalProtectionVault, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
            daoMultisig
        ]);
        await expectRole(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, Roles.Upgradeable.ROLE_ADMIN);
    });
});
