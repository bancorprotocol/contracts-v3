import Contracts from '../../components/Contracts';
import {
    BancorNetwork,
    TokenHolderUpgradeable,
    PoolCollection,
    TestERC20Token,
    NetworkSettings
} from '../../typechain';
import { ZERO_ADDRESS } from '../helpers/Constants';
import { createSystem, createTokenHolder, createPoolCollection } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

describe('BancorNetwork', () => {
    let nonOwner: SignerWithAddress;
    let newOwner: SignerWithAddress;
    let dummy: SignerWithAddress;

    shouldHaveGap('BancorNetwork', '_externalProtectionWallet');

    before(async () => {
        [, nonOwner, newOwner, dummy] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { network } = await createSystem();

            await expect(network.initialize(dummy.address)).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should revert when initialized with an invalid network token governance contract', async () => {
            await expect(Contracts.BancorNetwork.deploy(ZERO_ADDRESS, dummy.address, dummy.address)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should revert when initialized with an invalid governance token governance contract', async () => {
            await expect(Contracts.BancorNetwork.deploy(dummy.address, ZERO_ADDRESS, dummy.address)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should revert when initialized with an invalid network settings contract', async () => {
            await expect(Contracts.BancorNetwork.deploy(dummy.address, dummy.address, ZERO_ADDRESS)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should be properly initialized', async () => {
            const {
                network,
                networkToken,
                networkTokenGovernance,
                govToken,
                govTokenGovernance,
                networkSettings,
                pendingWithdrawals
            } = await createSystem();

            expect(await network.version()).to.equal(1);

            expect(await network.networkToken()).to.equal(networkToken.address);
            expect(await network.networkTokenGovernance()).to.equal(networkTokenGovernance.address);
            expect(await network.govToken()).to.equal(govToken.address);
            expect(await network.govTokenGovernance()).to.equal(govTokenGovernance.address);
            expect(await network.settings()).to.equal(networkSettings.address);
            expect(await network.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await network.externalProtectionWallet()).to.equal(ZERO_ADDRESS);
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
            expect(await network.isPoolValid(networkToken.address)).to.be.true;
        });
    });

    describe('external protection wallet', () => {
        let newExternalProtectionWallet: TokenHolderUpgradeable;
        let network: BancorNetwork;

        beforeEach(async () => {
            ({ network } = await createSystem());

            newExternalProtectionWallet = await createTokenHolder();
        });

        it('should revert when a non-owner attempts to set the external protection wallet', async () => {
            await expect(
                network.connect(nonOwner).setExternalProtectionWallet(newExternalProtectionWallet.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting external protection wallet to an invalid address', async () => {
            await expect(network.setExternalProtectionWallet(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should ignore updates to the same external protection wallet', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(newExternalProtectionWallet.address);

            const res = await network.setExternalProtectionWallet(newExternalProtectionWallet.address);
            await expect(res).not.to.emit(network, 'ExternalProtectionWalletUpdated');
        });

        it('should be to able to set and update the external protection wallet', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);

            const res = await network.setExternalProtectionWallet(newExternalProtectionWallet.address);
            await expect(res)
                .to.emit(network, 'ExternalProtectionWalletUpdated')
                .withArgs(ZERO_ADDRESS, newExternalProtectionWallet.address);
            expect(await network.externalProtectionWallet()).to.equal(newExternalProtectionWallet.address);
            expect(await newExternalProtectionWallet.owner()).to.equal(network.address);

            const newExternalProtectionWallet2 = await createTokenHolder();
            await newExternalProtectionWallet2.transferOwnership(network.address);

            const res2 = await network.setExternalProtectionWallet(newExternalProtectionWallet2.address);
            await expect(res2)
                .to.emit(network, 'ExternalProtectionWalletUpdated')
                .withArgs(newExternalProtectionWallet.address, newExternalProtectionWallet2.address);
            expect(await network.externalProtectionWallet()).to.equal(newExternalProtectionWallet2.address);
            expect(await newExternalProtectionWallet2.owner()).to.equal(network.address);
        });

        it('should revert when attempting to set the external protection wallet without transferring its ownership', async () => {
            await expect(network.setExternalProtectionWallet(newExternalProtectionWallet.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when a non-owner attempts to transfer the ownership of the protection wallet', async () => {
            await expect(
                network.connect(newOwner).transferExternalProtectionWalletOwnership(newOwner.address)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should allow explicitly transferring the ownership', async () => {
            await newExternalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(newExternalProtectionWallet.address);
            expect(await newExternalProtectionWallet.owner()).to.equal(network.address);

            await network.transferExternalProtectionWalletOwnership(newOwner.address);
            await newExternalProtectionWallet.connect(newOwner).acceptOwnership();
            expect(await newExternalProtectionWallet.owner()).to.equal(newOwner.address);
        });
    });

    describe('pool collections', () => {
        let network: BancorNetwork;
        let poolCollection: PoolCollection;
        let poolType: number;

        beforeEach(async () => {
            ({ network, poolCollection } = await createSystem());

            poolType = await poolCollection.poolType();
        });

        describe('adding new pool collection', () => {
            it('should revert when a non-owner attempts to add a new pool collection', async () => {
                await expect(network.connect(nonOwner).addPoolCollection(poolCollection.address)).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            it('should revert when attempting to add an invalid pool collection', async () => {
                await expect(network.connect(nonOwner).addPoolCollection(ZERO_ADDRESS)).to.be.revertedWith(
                    'ERR_INVALID_ADDRESS'
                );
            });

            it('should add a new pool collections', async () => {
                expect(await network.poolCollections()).to.be.empty;
                expect(await network.latestPoolCollection(poolType)).to.equal(ZERO_ADDRESS);

                const res = await network.addPoolCollection(poolCollection.address);
                await expect(res).to.emit(network, 'PoolCollectionAdded').withArgs(poolType, poolCollection.address);
                await expect(res)
                    .to.emit(network, 'LatestPoolCollectionReplaced')
                    .withArgs(poolType, ZERO_ADDRESS, poolCollection.address);

                expect(await network.poolCollections()).to.have.members([poolCollection.address]);
                expect(await network.latestPoolCollection(poolType)).to.equal(poolCollection.address);
            });

            context('with an existing pool collection', () => {
                beforeEach(async () => {
                    await network.addPoolCollection(poolCollection.address);
                });

                it('should revert when attempting to add the same pool collection', async () => {
                    await expect(network.addPoolCollection(poolCollection.address)).to.be.revertedWith(
                        'ERR_COLLECTION_ALREADY_EXISTS'
                    );
                });

                it('should add a new pool collection with the same type', async () => {
                    expect(await network.poolCollections()).to.have.members([poolCollection.address]);

                    const newPoolCollection = await createPoolCollection(network);
                    const poolType = await newPoolCollection.poolType();

                    const res = await network.addPoolCollection(newPoolCollection.address);
                    await expect(res)
                        .to.emit(network, 'PoolCollectionAdded')
                        .withArgs(poolType, newPoolCollection.address);
                    await expect(res)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, poolCollection.address, newPoolCollection.address);

                    expect(await network.poolCollections()).to.have.members([
                        poolCollection.address,
                        newPoolCollection.address
                    ]);
                });
            });
        });

        describe('removing existing pool collections', () => {
            beforeEach(async () => {
                await network.addPoolCollection(poolCollection.address);
            });

            it('should add another new pool collection with the same type', async () => {
                expect(await network.poolCollections()).to.have.members([poolCollection.address]);

                const newPoolCollection = await createPoolCollection(network);
                const poolType = await newPoolCollection.poolType();

                const res = await network.addPoolCollection(newPoolCollection.address);
                await expect(res).to.emit(network, 'PoolCollectionAdded').withArgs(poolType, newPoolCollection.address);
                await expect(res)
                    .to.emit(network, 'LatestPoolCollectionReplaced')
                    .withArgs(poolType, poolCollection.address, newPoolCollection.address);

                expect(await network.poolCollections()).to.have.members([
                    poolCollection.address,
                    newPoolCollection.address
                ]);
            });

            it('should revert when a attempting to remove a pool with a non-existing alternative pool collection', async () => {
                const newPoolCollection = await createPoolCollection(network);
                await expect(
                    network.removePoolCollection(poolCollection.address, newPoolCollection.address)
                ).to.be.revertedWith('ERR_COLLECTION_DOES_NOT_EXIST');
            });

            context('with an exiting alternative pool collection', () => {
                let newPoolCollection: PoolCollection;
                let lastCollection: PoolCollection;

                beforeEach(async () => {
                    newPoolCollection = await createPoolCollection(network);
                    lastCollection = await createPoolCollection(network);

                    await network.addPoolCollection(newPoolCollection.address);
                    await network.addPoolCollection(lastCollection.address);
                });

                it('should revert when a non-owner attempts to remove an existing pool collection', async () => {
                    await expect(
                        network
                            .connect(nonOwner)
                            .removePoolCollection(poolCollection.address, newPoolCollection.address)
                    ).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                it('should revert when attempting to remove a non-existing pool collection', async () => {
                    await expect(
                        network.removePoolCollection(ZERO_ADDRESS, newPoolCollection.address)
                    ).to.be.revertedWith('ERR_COLLECTION_DOES_NOT_EXIST');

                    const otherCollection = await createPoolCollection(network);
                    await expect(
                        network.removePoolCollection(otherCollection.address, newPoolCollection.address)
                    ).to.be.revertedWith('ERR_COLLECTION_DOES_NOT_EXIST');
                });

                it('should remove an existing pool collection', async () => {
                    expect(await network.poolCollections()).to.have.members([
                        poolCollection.address,
                        newPoolCollection.address,
                        lastCollection.address
                    ]);
                    expect(await network.latestPoolCollection(poolType)).to.equal(lastCollection.address);

                    const res = await network.removePoolCollection(poolCollection.address, newPoolCollection.address);
                    await expect(res)
                        .to.emit(network, 'PoolCollectionRemoved')
                        .withArgs(poolType, poolCollection.address);
                    await expect(res)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, lastCollection.address, newPoolCollection.address);

                    expect(await network.poolCollections()).to.have.members([
                        newPoolCollection.address,
                        lastCollection.address
                    ]);
                    expect(await network.latestPoolCollection(poolType)).to.equal(newPoolCollection.address);

                    const res2 = await network.removePoolCollection(newPoolCollection.address, lastCollection.address);
                    await expect(res2)
                        .to.emit(network, 'PoolCollectionRemoved')
                        .withArgs(poolType, newPoolCollection.address);
                    await expect(res2)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, newPoolCollection.address, lastCollection.address);

                    expect(await network.poolCollections()).to.have.members([lastCollection.address]);
                    expect(await network.latestPoolCollection(poolType)).to.equal(lastCollection.address);

                    const res3 = await network.removePoolCollection(lastCollection.address, ZERO_ADDRESS);
                    await expect(res3)
                        .to.emit(network, 'PoolCollectionRemoved')
                        .withArgs(poolType, lastCollection.address);
                    await expect(res3)
                        .to.emit(network, 'LatestPoolCollectionReplaced')
                        .withArgs(poolType, lastCollection.address, ZERO_ADDRESS);

                    expect(await network.poolCollections()).to.be.empty;
                    expect(await network.latestPoolCollection(poolType)).to.equal(ZERO_ADDRESS);
                });

                it.skip('should revert when attempting to remove a pool collection with associated pools', async () => {});
                it.skip('should revert when attempting to remove a pool collection with an alternative with a different type', async () => {});
            });
        });

        describe('setting the latest pool collections', () => {
            let newPoolCollection: PoolCollection;

            beforeEach(async () => {
                newPoolCollection = await createPoolCollection(network);

                await network.addPoolCollection(newPoolCollection.address);
                await network.addPoolCollection(poolCollection.address);
            });

            it('should revert when a non-owner attempts to set the latest pool collection', async () => {
                await expect(
                    network.connect(nonOwner).setLatestPoolCollection(poolCollection.address)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when attempting to set the latest pool collection to an invalid pool collection', async () => {
                await expect(network.connect(nonOwner).setLatestPoolCollection(ZERO_ADDRESS)).to.be.revertedWith(
                    'ERR_INVALID_ADDRESS'
                );

                const newPoolCollection2 = await createPoolCollection(network);
                await expect(network.setLatestPoolCollection(newPoolCollection2.address)).to.be.revertedWith(
                    'ERR_COLLECTION_DOES_NOT_EXIST'
                );
            });

            it('should ignore setting to the same latest pool collection', async () => {
                await network.setLatestPoolCollection(newPoolCollection.address);

                const res = await network.setLatestPoolCollection(newPoolCollection.address);
                await expect(res).not.to.emit(network, 'LatestPoolCollectionReplaced');
            });

            it('should set the latest pool collection', async () => {
                expect(await network.latestPoolCollection(poolType)).to.equal(poolCollection.address);

                const res = await network.setLatestPoolCollection(newPoolCollection.address);
                await expect(res)
                    .to.emit(network, 'LatestPoolCollectionReplaced')
                    .withArgs(poolType, poolCollection.address, newPoolCollection.address);

                expect(await network.latestPoolCollection(poolType)).to.equal(newPoolCollection.address);

                const res2 = await network.setLatestPoolCollection(poolCollection.address);
                await expect(res2)
                    .to.emit(network, 'LatestPoolCollectionReplaced')
                    .withArgs(poolType, newPoolCollection.address, poolCollection.address);

                expect(await network.latestPoolCollection(poolType)).to.equal(poolCollection.address);
            });
        });
    });

    describe('create pool', () => {
        let reserveToken: TestERC20Token;
        let networkSettings: NetworkSettings;
        let network: BancorNetwork;
        let poolCollection: PoolCollection;
        let poolType: number;

        beforeEach(async () => {
            reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));

            ({ network, networkSettings, poolCollection } = await createSystem());

            poolType = await poolCollection.poolType();
        });

        it('should revert when attempting to create a pool for an invalid reserve token', async () => {
            await expect(network.createPool(poolType, ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when attempting to create a pool for an unsupported type', async () => {
            await expect(network.createPool(BigNumber.from(12345), reserveToken.address)).to.be.revertedWith(
                'ERR_UNSUPPORTED_TYPE'
            );
        });

        context('with an associated pool collection', () => {
            beforeEach(async () => {
                await network.addPoolCollection(poolCollection.address);
            });

            it('should revert when attempting to create a pool for a non-whitelisted reserve token', async () => {
                await expect(network.createPool(poolType, reserveToken.address)).to.be.revertedWith(
                    'ERR_POOL_NOT_WHITELISTED'
                );
            });

            context('with a whitelisted token', () => {
                beforeEach(async () => {
                    await networkSettings.addTokenToWhitelist(reserveToken.address);
                });

                it('should create a pool', async () => {
                    expect(await network.isPoolValid(reserveToken.address)).to.be.false;
                    expect(await network.collectionByPool(reserveToken.address)).to.equal(ZERO_ADDRESS);
                    expect(await network.liquidityPools()).to.be.empty;
                    expect(await poolCollection.isPoolValid(reserveToken.address)).to.be.false;

                    const res = await network.createPool(poolType, reserveToken.address);
                    await expect(res)
                        .to.emit(network, 'PoolAdded')
                        .withArgs(poolType, reserveToken.address, poolCollection.address);

                    expect(await network.isPoolValid(reserveToken.address)).to.be.true;
                    expect(await network.collectionByPool(reserveToken.address)).to.equal(poolCollection.address);
                    expect(await network.liquidityPools()).to.have.members([reserveToken.address]);
                    expect(await poolCollection.isPoolValid(reserveToken.address)).to.be.true;
                });

                it('should revert when attempting to create a pool for the same reserve token twice', async () => {
                    await network.createPool(poolType, reserveToken.address);
                    await expect(network.createPool(poolType, reserveToken.address)).to.be.revertedWith(
                        'ERR_POOL_ALREADY_EXISTS'
                    );
                });
            });
        });
    });
});
