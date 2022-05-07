import { BNTPool, ExternalProtectionVault, MasterVault, PoolCollection } from '../../components/Contracts';
import { BancorNetworkV1, PoolCollectionType1V1 } from '../../components/LegacyContractsV3';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_TRADING_FEE_PPM, PoolType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

describeDeployment(__filename, () => {
    let network: BancorNetworkV1;
    let bntPool: BNTPool;
    let masterVault: MasterVault;
    let externalProtectionVault: ExternalProtectionVault;
    let prevPoolCollection: PoolCollectionType1V1;
    let newPoolCollection: PoolCollection;

    beforeEach(async () => {
        network = await DeployedContracts.BancorNetworkV2.deployed();
        bntPool = await DeployedContracts.BNTPool.deployed();
        masterVault = await DeployedContracts.MasterVault.deployed();
        externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
        prevPoolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
        newPoolCollection = await DeployedContracts.PoolCollectionType1V2.deployed();
    });

    it('should deploy and migrate the new pool collection contract', async () => {
        expect(await newPoolCollection.version()).to.equal(2);

        expect(await newPoolCollection.poolType()).to.equal(PoolType.Standard);
        expect(await newPoolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

        expect(await network.latestPoolCollection(PoolType.Standard)).to.equal(newPoolCollection.address);
        expect(await network.poolCollections()).not.to.include(prevPoolCollection.address);

        const { dai, link } = await getNamedAccounts();
        expect(await newPoolCollection.pools()).to.deep.equal([NATIVE_TOKEN_ADDRESS, dai, link]);

        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_BNT_MANAGER, [newPoolCollection.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_VAULT_MANAGER, [newPoolCollection.address]);
        await expectRoleMembers(bntPool, Roles.BNTPool.ROLE_FUNDING_MANAGER, [newPoolCollection.address]);
        await expectRoleMembers(masterVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            network.address,
            newPoolCollection.address
        ]);
        await expectRoleMembers(externalProtectionVault, Roles.Vault.ROLE_ASSET_MANAGER, [
            network.address,
            newPoolCollection.address
        ]);
    });
});
