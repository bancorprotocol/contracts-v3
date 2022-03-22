import Contracts, {
    ExternalProtectionVault,
    IERC20,
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
import { ZERO_ADDRESS } from '../../utils/Constants';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createPool, createPoolCollection, createSystem, createTestToken } from '../helpers/Factory';
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
            await expect(Contracts.TestPoolMigrator.deploy(ZERO_ADDRESS)).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(poolMigrator.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await poolMigrator.version()).to.equal(1);

            await expectRoles(poolMigrator, Roles.Upgradeable);

            await expectRole(poolMigrator, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('pool migrate', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkSettings: NetworkSettings;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let bntPool: TestBNTPool;
        let poolCollection: TestPoolCollection;
        let poolMigrator: TestPoolMigrator;
        let poolTokenFactory: PoolTokenFactory;
        let poolToken: PoolToken;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({
                network,
                bnt,
                networkSettings,
                masterVault,
                externalProtectionVault,
                bntPool,
                poolMigrator,
                poolCollection,
                poolTokenFactory
            } = await createSystem());

            reserveToken = await createTestToken();

            poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);
        });

        it('should revert when attempting to migrate from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(poolMigrator.connect(nonNetwork).migratePool(reserveToken.address)).to.be.revertedWith(
                'AccessDenied'
            );
        });

        it('should revert when attempting to migrate an invalid pool', async () => {
            await expect(network.migratePoolT(poolMigrator.address, ZERO_ADDRESS)).to.be.revertedWith('InvalidPool');
        });

        it('should revert when attempting to migrate a non-existing pool', async () => {
            const reserveToken2 = await createTestToken();
            await expect(network.migratePoolT(poolMigrator.address, reserveToken2.address)).to.be.revertedWith(
                'InvalidPool'
            );
        });

        it('should revert when attempting to migrate a pool already existing in the latest pool collection', async () => {
            await expect(network.migratePoolT(poolMigrator.address, reserveToken.address)).to.be.revertedWith(
                'InvalidPoolCollection'
            );
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
                1000
            );
            await createPool(reserveToken2, network, networkSettings, poolCollection2);

            const reserveToken3 = await createTestToken();
            const poolCollection3 = await createPoolCollection(
                network,
                bnt,
                networkSettings,
                masterVault,
                bntPool,
                externalProtectionVault,
                poolTokenFactory,
                poolMigrator,
                (await poolCollection2.version()) + 1
            );
            await createPool(reserveToken3, network, networkSettings, poolCollection3);

            await expect(network.migratePoolT(poolMigrator.address, reserveToken2.address)).to.be.revertedWith(
                'UnsupportedVersion'
            );
        });

        context('v1', () => {
            let targetPoolCollection: TestPoolCollection;

            beforeEach(async () => {
                targetPoolCollection = await createPoolCollection(
                    network,
                    bnt,
                    networkSettings,
                    masterVault,
                    bntPool,
                    externalProtectionVault,
                    poolTokenFactory,
                    poolMigrator,
                    (await poolCollection.version()) + 1
                );

                await network.addPoolCollection(targetPoolCollection.address);
            });

            it('should migrate', async () => {
                const newPoolCollection = await network.callStatic.migratePoolT(
                    poolMigrator.address,
                    reserveToken.address
                );

                expect(newPoolCollection).to.equal(targetPoolCollection.address);

                let poolData = await poolCollection.poolData(reserveToken.address);
                let newPoolData = await targetPoolCollection.poolData(reserveToken.address);
                expect(newPoolData.poolToken).to.equal(ZERO_ADDRESS);

                expect(await poolToken.owner()).to.equal(poolCollection.address);

                const res = await network.migratePoolT(poolMigrator.address, reserveToken.address);
                await expect(res)
                    .to.emit(poolMigrator, 'PoolMigrated')
                    .withArgs(reserveToken.address, poolCollection.address, targetPoolCollection.address);

                newPoolData = await targetPoolCollection.poolData(reserveToken.address);
                expect(newPoolData).to.deep.equal(poolData);

                poolData = await poolCollection.poolData(reserveToken.address);
                expect(poolData.poolToken).to.equal(ZERO_ADDRESS);

                expect(await poolToken.owner()).to.equal(targetPoolCollection.address);
            });
        });
    });
});
