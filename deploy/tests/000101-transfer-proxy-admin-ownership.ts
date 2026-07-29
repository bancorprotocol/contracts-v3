import { ProxyAdmin } from '../../components/Contracts';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DeployedContracts, isLive } from '../../utils/Deploy';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(
    __filename,
    () => {
        let proxyAdminOwner: string;
        let proxyAdmin: ProxyAdmin;

        before(async () => {
            ({ proxyAdminOwner } = await getNamedAccounts());
        });

        beforeEach(async () => {
            proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        });

        it('should transfer the ownership of the proxy admin contract', async () => {
            expect(await proxyAdmin.owner()).to.equal(proxyAdminOwner);
        });
    },
    { skip: isLive }
);
