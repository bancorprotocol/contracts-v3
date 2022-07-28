import Contracts, {
    ExternalProtectionVault,
    IERC20,
    IPoolCollection,
    MasterVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestBNTPool,
    TestERC20Token,
    TestPoolCollection,
    TestPoolMigrator
} from '../../components/Contracts';
import LegacyContractsV3, { PoolCollectionType1V9 } from '../../components/LegacyContractsV3';
import { MAX_UINT256, ZERO_ADDRESS } from '../../utils/Constants';
import { toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createPool, createPoolCollection, createSystem, createTestToken, depositToPool } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('PoolMigrator', () => {
    let deployer: SignerWithAddress;

    shouldHaveGap('PoolMigrator');

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    describe('construction', () => {
        let poolMigrator: TestPoolMigrator;

        beforeEach(async () => {
            ({ poolMigrator } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(Contracts.TestPoolMigrator.deploy(ZERO_ADDRESS)).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(poolMigrator.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await poolMigrator.version()).to.equal(5);

            await expectRoles(poolMigrator, Roles.Upgradeable);

            await expectRole(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('pool migration', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkSettings: NetworkSettings;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let bntPool: TestBNTPool;
        let poolMigrator: TestPoolMigrator;
        let poolTokenFactory: PoolTokenFactory;
        let poolToken: PoolToken;
        let reserveToken: TestERC20Token;

        let prevPoolCollection: PoolCollectionType1V9;
        let newPoolCollection: TestPoolCollection;

        const BNT_VIRTUAL_BALANCE = 1;
        const BASE_TOKEN_VIRTUAL_BALANCE = 2;
        const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);
        const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
            .div(BNT_VIRTUAL_BALANCE)
            .mul(1000);

        beforeEach(async () => {
            ({
                network,
                bnt,
                networkSettings,
                masterVault,
                externalProtectionVault,
                bntPool,
                poolMigrator,
                poolTokenFactory
            } = await createSystem());

            reserveToken = await createTestToken();

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            prevPoolCollection = await LegacyContractsV3.PoolCollectionType1V9.deploy(
                network.address,
                bnt.address,
                networkSettings.address,
                masterVault.address,
                bntPool.address,
                externalProtectionVault.address,
                poolTokenFactory.address,
                poolMigrator.address
            );

            await network.registerPoolCollection(prevPoolCollection.address);

            poolToken = await createPool(
                reserveToken,
                network,
                networkSettings,
                prevPoolCollection as any as IPoolCollection
            );

            await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

            await depositToPool(deployer, reserveToken, INITIAL_LIQUIDITY, network);

            await prevPoolCollection.enableTrading(
                reserveToken.address,
                BNT_VIRTUAL_BALANCE,
                BASE_TOKEN_VIRTUAL_BALANCE
            );

            newPoolCollection = await createPoolCollection(
                network,
                bnt,
                networkSettings,
                masterVault,
                bntPool,
                externalProtectionVault,
                poolTokenFactory,
                poolMigrator
            );

            await network.registerPoolCollection(newPoolCollection.address);
        });

        it('should revert when attempting to migrate from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                poolMigrator.connect(nonNetwork).migratePool(reserveToken.address, newPoolCollection.address)
            ).to.be.revertedWithError('AccessDenied');
        });

        it('should revert when attempting to migrate an invalid pool', async () => {
            await expect(
                network.migratePoolT(poolMigrator.address, ZERO_ADDRESS, newPoolCollection.address)
            ).to.be.revertedWithError('InvalidPool');
        });

        it('should revert when attempting to migrate to an invalid pool collection', async () => {
            await expect(
                network.migratePoolT(poolMigrator.address, reserveToken.address, ZERO_ADDRESS)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to migrate a non-existing pool', async () => {
            const reserveToken2 = await createTestToken();
            await expect(
                network.migratePoolT(poolMigrator.address, reserveToken2.address, newPoolCollection.address)
            ).to.be.revertedWithError('InvalidPool');
        });

        it('should revert when attempting to migrate a pool that already exists in the pool collection', async () => {
            await expect(
                network.migratePoolT(poolMigrator.address, reserveToken.address, prevPoolCollection.address)
            ).to.be.revertedWithError('AlreadyExists');
        });

        it('should revert when attempting to migrate a pool to a pool collection of a different type', async () => {
            const newPoolCollection2 = await createPoolCollection(
                network,
                bnt,
                networkSettings,
                masterVault,
                bntPool,
                externalProtectionVault,
                poolTokenFactory,
                poolMigrator,
                (await prevPoolCollection.poolType()) + 10,
                await newPoolCollection.version()
            );

            await expect(
                network.migratePoolT(poolMigrator.address, reserveToken.address, newPoolCollection2.address)
            ).to.be.revertedWithError('InvalidPoolType');
        });

        it('should revert when attempting to migrate a pool with an unsupported version', async () => {
            const reserveToken2 = await createTestToken();
            const poolCollection2 = await createPoolCollection(
                network,
                bnt,
                networkSettings,
                masterVault,
                bntPool,
                externalProtectionVault,
                poolTokenFactory,
                poolMigrator,
                await prevPoolCollection.poolType(),
                0
            );
            await createPool(reserveToken2, network, networkSettings, poolCollection2);

            await expect(
                network.migratePoolT(poolMigrator.address, reserveToken2.address, newPoolCollection.address)
            ).to.be.revertedWithError('UnsupportedVersion');
        });

        it('should migrate', async () => {
            let poolData = await prevPoolCollection.poolData(reserveToken.address);
            let newPoolData = await newPoolCollection.poolData(reserveToken.address);
            expect(newPoolData.poolToken).to.equal(ZERO_ADDRESS);

            expect(await poolToken.owner()).to.equal(prevPoolCollection.address);

            await network.migratePoolT(poolMigrator.address, reserveToken.address, newPoolCollection.address);

            newPoolData = await newPoolCollection.poolData(reserveToken.address);

            expect(newPoolData.poolToken).to.equal(poolData.poolToken);
            expect(newPoolData.tradingFeePPM).to.equal(poolData.tradingFeePPM);
            expect(newPoolData.tradingEnabled).to.equal(poolData.tradingEnabled);
            expect(newPoolData.depositingEnabled).to.equal(poolData.depositingEnabled);

            expect(newPoolData.averageRates.blockNumber).to.equal(poolData.averageRates.blockNumber);
            expect(newPoolData.averageRates.rate).to.deep.equal(poolData.averageRates.rate);
            expect(newPoolData.averageRates.invRate).to.deep.equal(poolData.averageRates.invRate);

            expect(newPoolData.liquidity).to.deep.equal(poolData.liquidity);

            poolData = await prevPoolCollection.poolData(reserveToken.address);
            expect(poolData.poolToken).to.equal(ZERO_ADDRESS);

            expect(await poolToken.owner()).to.equal(newPoolCollection.address);
        });
    });
});
