import { AsyncReturnType } from '../../components/ContractBuilder';
import {
    BancorNetwork,
    BancorNetworkInfo,
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterVault,
    NetworkSettings,
    PendingWithdrawals,
    PoolCollection,
    PoolMigrator,
    PoolToken
} from '../../components/Contracts';
import { BNT, TokenGovernance, VBNT } from '../../components/LegacyContracts';
import { PoolCollectionType1V2 } from '../../components/LegacyContractsV3';
import { expectRoleMembers, Roles } from '../../test/helpers/AccessControl';
import { describeDeployment } from '../../test/helpers/Deploy';
import { DEFAULT_LOCK_DURATION, DEFAULT_TRADING_FEE_PPM, PoolType } from '../../utils/Constants';
import { DeployedContracts } from '../../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { expect } from 'chai';
import { getNamedAccounts } from 'hardhat';

const prevState: Record<string, AsyncReturnType<PoolCollectionType1V2['poolData']>> = {};

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
        let deployer: string;

        let network: BancorNetwork;
        let bnt: BNT;
        let vbnt: VBNT;
        let bntGovernance: TokenGovernance;
        let vbntGovernance: TokenGovernance;
        let networkSettings: NetworkSettings;
        let pendingWithdrawals: PendingWithdrawals;
        let bntPool: BNTPool;
        let bnBNT: PoolToken;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let externalRewardsVault: ExternalRewardsVault;
        let poolMigrator: PoolMigrator;
        let prevPoolCollection: PoolCollectionType1V2;
        let newPoolCollection: PoolCollection;
        let networkInfo: BancorNetworkInfo;

        before(async () => {
            ({ deployer } = await getNamedAccounts());
        });

        beforeEach(async () => {
            network = await DeployedContracts.BancorNetwork.deployed();
            bnt = await DeployedContracts.BNT.deployed();
            vbnt = await DeployedContracts.VBNT.deployed();
            bntGovernance = await DeployedContracts.BNTGovernance.deployed();
            vbntGovernance = await DeployedContracts.VBNTGovernance.deployed();
            networkSettings = await DeployedContracts.NetworkSettings.deployed();
            pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
            bntPool = await DeployedContracts.BNTPool.deployed();
            bnBNT = await DeployedContracts.bnBNT.deployed();
            masterVault = await DeployedContracts.MasterVault.deployed();
            externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();
            externalRewardsVault = await DeployedContracts.ExternalRewardsVault.deployed();
            poolMigrator = await DeployedContracts.PoolMigrator.deployed();
            prevPoolCollection = await DeployedContracts.PoolCollectionType1V2.deployed();
            newPoolCollection = await DeployedContracts.PoolCollectionType1V3.deployed();
            networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
        });

        it('should deploy and migrate the new pool collection contract and related contracts', async () => {
            await expectRoleMembers(network, Roles.BancorNetwork.ROLE_EMERGENCY_STOPPER, [deployer]);

            expect(await pendingWithdrawals.version()).to.equal(3);
            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);

            expect(await bntPool.version()).to.equal(2);
            expect(await poolMigrator.version()).to.equal(2);

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

            expect(await networkInfo.version()).to.equal(2);

            expect(await networkInfo.network()).to.equal(network.address);
            expect(await networkInfo.bnt()).to.equal(bnt.address);
            expect(await networkInfo.bntGovernance()).to.equal(bntGovernance.address);
            expect(await networkInfo.vbnt()).to.equal(vbnt.address);
            expect(await networkInfo.vbntGovernance()).to.equal(vbntGovernance.address);
            expect(await networkInfo.networkSettings()).to.equal(networkSettings.address);
            expect(await networkInfo.masterVault()).to.equal(masterVault.address);
            expect(await networkInfo.externalProtectionVault()).to.equal(externalProtectionVault.address);
            expect(await networkInfo.externalRewardsVault()).to.equal(externalRewardsVault.address);
            expect(await networkInfo.bntPool()).to.equal(bntPool.address);
            expect(await networkInfo.poolToken(bnt.address)).to.equal(bnBNT.address);
            expect(await networkInfo.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await networkInfo.poolMigrator()).to.equal(poolMigrator.address);

            expect(await network.version()).to.equal(4);
        });
    },
    { beforeDeployments: savePreviousPoolData }
);
