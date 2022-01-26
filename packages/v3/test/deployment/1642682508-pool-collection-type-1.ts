import {
    BancorNetwork,
    ExternalProtectionVault,
    MasterPool,
    MasterVault,
    PoolCollection
} from '../../components/Contracts';
import { PoolType, DEFAULT_TRADING_FEE_PPM } from '../../utils/Constants';
import { ContractName, DeployedContracts } from '../../utils/Deploy';
import { expectRoleMembers, Roles } from '../helpers/AccessControl';
import { describeDeployment } from '../helpers/Deploy';
import { expect } from 'chai';

describeDeployment('1642682508-pool-collection-type-1', ContractName.PoolCollectionType1V1, () => {
    let network: BancorNetwork;
    let masterPool: MasterPool;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let poolCollection: PoolCollection;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetworkV1.deployed();
        masterPool = await DeployedContracts.MasterPoolV1.deployed();
        masterVault = await DeployedContracts.MasterVaultV1.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVaultV1.deployed();
        poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
    });

    it('should deploy and configure the pool collection contract', async () => {
        expect(await poolCollection.version()).to.equal(1);

        expect(await poolCollection.poolType()).to.equal(PoolType.Standard);
        expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

        expect(await network.latestPoolCollection(PoolType.Standard)).to.equal(poolCollection.address);

        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_NETWORK_TOKEN_MANAGER, [poolCollection.address]);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_VAULT_MANAGER, [poolCollection.address]);
        await expectRoleMembers(masterPool, Roles.MasterPool.ROLE_FUNDING_MANAGER, [poolCollection.address]);
        await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [network.address, poolCollection.address]);
        await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            network.address,
            poolCollection.address
        ]);
    });
});
