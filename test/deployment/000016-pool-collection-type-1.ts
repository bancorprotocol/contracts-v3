import { BNTPool, ExternalProtectionVault, MasterVault, PoolCollection } from '../../components/Contracts';
import { BancorNetworkV1 } from '../../components/LegacyContractsV3';
import { DEFAULT_TRADING_FEE_PPM, PoolType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment(__filename, () => {
    let network: BancorNetworkV1;
    let bntPool: BNTPool;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let poolCollection: PoolCollection;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetworkV1.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
    });

    it('should deploy and configure the pool collection contract', async () => {
        expect(await poolCollection.version()).to.equal(1);

        expect(await poolCollection.poolType()).to.equal(PoolType.Standard);
        expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

        expect(await network.latestPoolCollection(PoolType.Standard)).to.equal(poolCollection.address);

        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER, [poolCollection.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER, [poolCollection.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER, [poolCollection.address]);
        await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [network.address, poolCollection.address]);
        await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            network.address,
            poolCollection.address
        ]);
    });
});
