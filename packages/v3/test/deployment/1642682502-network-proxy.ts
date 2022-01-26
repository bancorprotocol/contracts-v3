import Contracts, { ProxyAdmin, TransparentUpgradeableProxyImmutable } from '../../components/Contracts';
import { ContractName, DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { Roles } from '../helpers/AccessControl';
import { expect } from 'chai';

describe('1642682502-network-proxy', () => {
    let proxyAdmin: ProxyAdmin;
    let networkProxy: TransparentUpgradeableProxyImmutable;

    beforeEach(async () => {
        await runTestDeployment(ContractName.BancorNetworkProxy);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        networkProxy = await DeployedContracts.BancorNetworkProxy.deployed();
    });

    it('should deploy the network proxy contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(networkProxy.address)).to.equal(proxyAdmin.address);

        // ensure that the network proxy isn't initialized
        const network = await Contracts.BancorNetwork.attach(networkProxy.address);
        expect(await network.getRoleAdmin(Roles.BancorNetwork.ROLE_MIGRATION_MANAGER)).to.equal(
            await network.DEFAULT_ADMIN_ROLE()
        );
    });
});
