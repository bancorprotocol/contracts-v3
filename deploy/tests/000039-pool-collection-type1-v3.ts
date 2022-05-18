import { AsyncReturnType } from '../../components/ContractBuilder';
import {
    BancorNetwork,
    BNTPool,
    ExternalProtectionVault,
    MasterVault,
    PoolCollection
} from '../../components/Contracts';
import { PoolCollectionType1V1, PoolCollectionType1V2 } from '../../components/LegacyContractsV3';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_TRADING_FEE_PPM, PoolType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

const prevState: Record<string, AsyncReturnType<PoolCollectionType1V1['poolData']>> = {};

const savePreviousPoolData = async () => {
    const prevPoolCollection = await DeployedContracts.PoolCollectionType1V2.deployed();

    const { dai, link } = await getNamedAccounts();

    for (const pool of [NATIVE_TOKEN_ADDRESS, dai, link]) {
        prevState[pool] = await prevPoolCollection.poolData(pool);
    }
};

describeDeployment(
    __filename,
    () => {
        let network: BancorNetwork;
        let bntPool: BNTPool;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let prevPoolCollection: PoolCollectionType1V2;
        let newPoolCollection: PoolCollection;

        beforeEach(async () => {
            network = await DeployedContracts.BancorNetwork.deployed();
            bntPool = await DeployedContracts.BNTPool.deployed();
            masterVault = await DeployedContracts.MasterVault.deployed();
            externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
            prevPoolCollection = await DeployedContracts.PoolCollectionType1V2.deployed();
            newPoolCollection = await DeployedContracts.PoolCollectionType1V3.deployed();
        });

        it('should deploy and migrate the new pool collection contract', async () => {
            expect(await newPoolCollection.version()).to.equal(3);

            expect(await newPoolCollection.poolType()).to.equal(PoolType.Standard);
            expect(await newPoolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

            expect(await network.latestPoolCollection(PoolType.Standard)).to.equal(newPoolCollection.address);
            expect(await network.poolCollections()).not.to.include(prevPoolCollection.address);

            const { dai, link } = await getNamedAccounts();
            expect(await newPoolCollection.pools()).to.deep.equal([NATIVE_TOKEN_ADDRESS, dai, link]);

            for (const pool of [NATIVE_TOKEN_ADDRESS, dai, link]) {
                const prevPoolData = prevState[pool];
                const newPoolData = await newPoolCollection.poolData(pool);

                expect(newPoolData.poolToken).to.equal(prevPoolData.poolToken);
                expect(newPoolData.tradingFeePPM).to.equal(prevPoolData.tradingFeePPM);
                expect(newPoolData.tradingEnabled).to.equal(prevPoolData.tradingEnabled);
                expect(newPoolData.depositingEnabled).to.equal(prevPoolData.depositingEnabled);
                expect(newPoolData.averageRate).to.deep.equal(prevPoolData.averageRate);
                expect(newPoolData.liquidity).to.deep.equal(prevPoolData.liquidity);
            }

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
    },
    { beforeDeployments: savePreviousPoolData }
);
