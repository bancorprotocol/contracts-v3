import Contracts from '../../components/Contracts';
import {
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestERC20Token,
    TestPoolCollection,
    TestPoolCollectionUpgrader
} from '../../typechain';
import { ZERO_ADDRESS, TKN } from '../helpers/Constants';
import { createPool, createPoolCollection, createSystem } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

describe('PoolCollectionUpgrader', () => {
    let deployer: SignerWithAddress;

    shouldHaveGap('PoolCollectionUpgrader');

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to initialize with an invalid network contract', async () => {
            await expect(Contracts.TestPoolCollectionUpgrader.deploy(ZERO_ADDRESS)).to.be.revertedWith(
                'InvalidAddress()'
            );
        });

        it('should revert when attempting to reinitialize', async () => {
            const { poolCollectionUpgrader } = await createSystem();

            await expect(poolCollectionUpgrader.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const { network, poolCollectionUpgrader } = await createSystem();

            expect(await poolCollectionUpgrader.version()).to.equal(1);

            expect(await poolCollectionUpgrader.network()).to.equal(network.address);
        });
    });

    describe('pool upgrade', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let poolTokenFactory: PoolTokenFactory;
        let poolToken: PoolToken;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, poolCollectionUpgrader, poolCollection, poolTokenFactory } =
                await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));

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
            const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
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
            const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
            const poolCollection2 = await createPoolCollection(network, poolTokenFactory, poolCollectionUpgrader, 1000);
            await createPool(reserveToken2, network, networkSettings, poolCollection2);

            const reserveToken3 = await Contracts.TestERC20Token.deploy(TKN, TKN, BigNumber.from(1_000_000));
            const poolCollection3 = await createPoolCollection(
                network,
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
