import Contracts, { ProxyAdmin, TransparentUpgradeableProxyImmutable } from '../../components/Contracts';
import { Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts } from '../../utils/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let proxyAdmin: ProxyAdmin;
    let networkProxy: TransparentUpgradeableProxyImmutable;

    beforeEach(async () => {
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
        expect(await network.getRoleAdmin(Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER)).to.equal(
            await network.DEFAULT_ADMIN_ROLE()
        );
        expect(await network.getRoleAdmin(Roles.BancorNetwork.ROLE_NETWORK_FEE_MANAGER)).to.equal(
            await network.DEFAULT_ADMIN_ROLE()
        );
    });
});
