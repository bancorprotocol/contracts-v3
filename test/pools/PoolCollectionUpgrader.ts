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
    TestPoolCollectionUpgrader
} from '../../components/Contracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createPool, createPoolCollection, createSystem, createTestToken } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('PoolCollectionUpgrader', () => {
    let deployer: SignerWithAddress;

    shouldHaveGap('PoolCollectionUpgrader');

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    describe('construction', () => {
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;

        beforeEach(async () => {
            ({ poolCollectionUpgrader } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(Contracts.TestPoolCollectionUpgrader.deploy(ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidAddress'
            );
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(poolCollectionUpgrader.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await poolCollectionUpgrader.version()).to.equal(1);

            await expectRoles(poolCollectionUpgrader, Roles.Upgradeable);

            await expectRole(poolCollectionUpgrader, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('pool upgrade', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkSettings: NetworkSettings;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let bntPool: TestBNTPool;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
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
                poolCollectionUpgrader,
                poolCollection,
                poolTokenFactory
            } = await createSystem());

            reserveToken = await createTestToken();

            poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);
        });

        it('should revert when attempting upgrade from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                poolCollectionUpgrader.connect(nonNetwork).upgradePool(reserveToken.address)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting upgrade an invalid pool', async () => {
            await expect(network.upgradePoolT(poolCollectionUpgrader.address, ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidPool'
            );
        });

        it('should revert when attempting upgrade a non-existing pool', async () => {
            const reserveToken2 = await createTestToken();
            await expect(
                network.upgradePoolT(poolCollectionUpgrader.address, reserveToken2.address)
            ).to.be.revertedWith('InvalidPool');
        });

        it('should revert when attempting upgrade a pool already existing in the latest pool collection', async () => {
            await expect(network.upgradePoolT(poolCollectionUpgrader.address, reserveToken.address)).to.be.revertedWith(
                'InvalidPoolCollection'
            );
        });

        it('should revert when attempting upgrade a pool with an unsupported version', async () => {
            const reserveToken2 = await createTestToken();
            const poolCollection2 = await createPoolCollection(
                network,
                bnt,
                networkSettings,
                masterVault,
                bntPool,
                externalProtectionVault,
                poolTokenFactory,
                poolCollectionUpgrader,
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
                poolCollectionUpgrader,
                (await poolCollection2.version()) + 1
            );
            await createPool(reserveToken3, network, networkSettings, poolCollection3);

            await expect(
                network.upgradePoolT(poolCollectionUpgrader.address, reserveToken2.address)
            ).to.be.revertedWith('UnsupportedVersion');
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
                    poolCollectionUpgrader,
                    (await poolCollection.version()) + 1
                );

                await network.addPoolCollection(targetPoolCollection.address);
            });

            it('should upgrade', async () => {
                const newPoolCollection = await network.callStatic.upgradePoolT(
                    poolCollectionUpgrader.address,
                    reserveToken.address
                );

                expect(newPoolCollection).to.equal(targetPoolCollection.address);

                let poolData = await poolCollection.poolData(reserveToken.address);
                let newPoolData = await targetPoolCollection.poolData(reserveToken.address);
                expect(newPoolData.poolToken).to.equal(ZERO_ADDRESS);

                expect(await poolToken.owner()).to.equal(poolCollection.address);

                const res = await network.upgradePoolT(poolCollectionUpgrader.address, reserveToken.address);
                await expect(res)
                    .to.emit(poolCollectionUpgrader, 'PoolUpgraded')
                    .withArgs(
                        await targetPoolCollection.poolType(),
                        reserveToken.address,
                        poolCollection.address,
                        targetPoolCollection.address,
                        await poolCollection.version(),
                        await targetPoolCollection.version()
                    );

                newPoolData = await targetPoolCollection.poolData(reserveToken.address);
                expect(newPoolData).to.deep.equal(poolData);

                poolData = await poolCollection.poolData(reserveToken.address);
                expect(poolData.poolToken).to.equal(ZERO_ADDRESS);

                expect(await poolToken.owner()).to.equal(targetPoolCollection.address);
            });
        });
    });
});
