import { ProxyAdmin } from '../../components/Contracts';
import { DeployedContracts, DeploymentTag } from '../../utils/Deploy';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment('1642682495-proxy-admin', DeploymentTag.ProxyAdmin, () => {
    let daoMultisig: string;
    let proxyAdmin: ProxyAdmin;

    before(async () => {
        ({ daoMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
    });

    it('should deploy and configure the proxy admin contract', async () => {
        expect(await proxyAdmin.owner()).to.equal(daoMultisig);
    });
});
