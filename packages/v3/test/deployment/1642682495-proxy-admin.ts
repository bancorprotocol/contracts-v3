import { ProxyAdmin } from '../../components/Contracts';
import { ContractName, DeployedContracts, isMainnet, runTestDeployment } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describe('1642682495-proxy-admin', () => {
    let daoMultisig: string;
    let proxyAdmin: ProxyAdmin;

    before(async () => {
        ({ daoMultisig } = await getNamedAccounts());
    });

    beforeEach(async () => {
        await runTestDeployment(ContractName.ProxyAdmin);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
    });

    it('should deploy and configure the proxy admin contract', async () => {
        expect(await proxyAdmin.owner()).to.equal(daoMultisig);
    });
});
