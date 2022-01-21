import { NetworkSettings, ProxyAdmin } from '../../components/Contracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expectRole, Roles } from '../helpers/AccessControl';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682501-network-settings', () => {
    let daoMultisig: string;
    let proxyAdmin: ProxyAdmin;
    let networkSettings: NetworkSettings;

    before(async () => {
        ({ daoMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.NetworkSettings);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        networkSettings = await DeployedContracts.NetworkSettings.deployed();
    });

    it('should deploy and configure the network settings contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(networkSettings.address)).to.equal(proxyAdmin.address);

        expect(await networkSettings.version()).to.equal(1);

        await expectRole(networkSettings, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [daoMultisig]);
    });
});
