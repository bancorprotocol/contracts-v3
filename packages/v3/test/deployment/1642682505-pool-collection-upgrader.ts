import { PoolCollectionUpgrader, ProxyAdmin } from '../../components/Contracts';
import { ContractName } from '../../utils/Constants';
import { DeployedContracts, runTestDeployment } from '../../utils/Deploy';
import { expect } from 'chai';

describe('1642682505-pool-collection-upgrader', () => {
    let proxyAdmin: ProxyAdmin;
    let poolCollectionUpgrader: PoolCollectionUpgrader;

    beforeEach(async () => {
        await runTestDeployment(ContractName.PoolCollectionUpgrader);

        proxyAdmin = await DeployedContracts.ProxyAdmin.deployed();
        poolCollectionUpgrader = await DeployedContracts.PoolCollectionUpgrader.deployed();
    });

    it('should deploy and configure the pool collection upgrader contract', async () => {
        expect(await proxyAdmin.getProxyAdmin(poolCollectionUpgrader.address)).to.equal(proxyAdmin.address);

        expect(await poolCollectionUpgrader.version()).to.equal(1);
    });
});
