import Contracts from '../../components/Contracts';
import {
    TestBancorNetwork,
    NetworkSettings,
    TestPoolCollection,
    PoolToken,
    TestERC20Token,
    TestPendingWithdrawals,
    TokenHolderUpgradeable,
    TestNetworkTokenPool,
    BancorVault,
    TokenGovernance
} from '../../typechain';
import { ZERO_ADDRESS, PPM_RESOLUTION } from '../helpers/Constants';
import { createPool, createPoolCollection, createSystem, createTokenHolder } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { TokenWithAddress, getBalance, getTokenBySymbol, getTransactionCost } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { solidityKeccak256 } = utils;

describe('BancorNetwork', () => {
    let nonOwner: SignerWithAddress;
    let newOwner: SignerWithAddress;

    shouldHaveGap('BancorNetwork', '_externalProtectionWallet');

    before(async () => {
        [, nonOwner, newOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { network, networkTokenPool } = await createSystem();

            await expect(network.initialize(networkTokenPool.address)).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should revert when attempting to initialize with an invalid network token pool contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, networkSettings, vault, networkPoolToken } =
                await createSystem();

            const network = await Contracts.BancorNetwork.deploy(
                networkTokenGovernance.address,
                govTokenGovernance.address,
                networkSettings.address,
                vault.address,
                networkPoolToken.address
            );

            await expect(network.initialize(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid network token governance contract', async () => {
            const { govTokenGovernance, networkSettings, vault, networkPoolToken } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    ZERO_ADDRESS,
                    govTokenGovernance.address,
                    networkSettings.address,
                    vault.address,
                    networkPoolToken.address
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid governance token governance contract', async () => {
            const { networkTokenGovernance, networkSettings, vault, networkPoolToken } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    vault.address,
                    networkPoolToken.address
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid network settings contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, vault, networkPoolToken } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    ZERO_ADDRESS,
                    vault.address,
                    networkPoolToken.address
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid vault contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, networkSettings, networkPoolToken } =
                await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    networkPoolToken.address
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when initialized with an invalid network pool token contract', async () => {
            const { networkTokenGovernance, govTokenGovernance, networkSettings, vault } = await createSystem();

            await expect(
                Contracts.BancorNetwork.deploy(
                    networkTokenGovernance.address,
                    govTokenGovernance.address,
                    networkSettings.address,
                    vault.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be properly initialized', async () => {
            const {
                network,
                networkToken,
                networkTokenGovernance,
                govToken,
                govTokenGovernance,
                networkSettings,
                vault,
                networkPoolToken,
                networkTokenPool,
                pendingWithdrawals
            } = await createSystem();

            expect(await network.version()).to.equal(1);

            expect(await network.networkToken()).to.equal(networkToken.address);
            expect(await network.networkTokenGovernance()).to.equal(networkTokenGovernance.address);
            expect(await network.govToken()).to.equal(govToken.address);
            expect(await network.govTokenGovernance()).to.equal(govTokenGovernance.address);
            expect(await network.settings()).to.equal(networkSettings.address);
            expect(await network.vault()).to.equal(vault.address);
            expect(await network.networkPoolToken()).to.equal(networkPoolToken.address);
            expect(await network.networkTokenPool()).to.equal(networkTokenPool.address);
            expect(await network.pendingWithdrawals()).to.equal(pendingWithdrawals.address);
            expect(await network.externalProtectionWallet()).to.equal(ZERO_ADDRESS);
            expect(await network.poolCollections()).to.be.empty;
            expect(await network.liquidityPools()).to.be.empty;
            expect(await network.isPoolValid(networkToken.address)).to.be.true;
        });
    });

    describe('external protection wallet', () => {
        let newExternalProtectionWallet: TokenHolderUpgradeable;
        let network: TestBancorNetwork;

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

        it('should be able to set and update the external protection wallet', async () => {
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
        let network: TestBancorNetwork;
        let poolCollection: TestPoolCollection;
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
                let newPoolCollection: TestPoolCollection;
                let lastCollection: TestPoolCollection;

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

                /* eslint-disable @typescript-eslint/no-empty-function */
                it.skip('should revert when attempting to remove a pool collection with associated pools', async () => {});
                it.skip('should revert when attempting to remove a pool collection with an alternative with a different type', async () => {});
                /* eslint-enable @typescript-eslint/no-empty-function */
            });
        });

        describe('setting the latest pool collections', () => {
            let newPoolCollection: TestPoolCollection;

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
        let reserveToken: TokenWithAddress;
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: TestERC20Token;
        let poolCollection: TestPoolCollection;
        let poolType: number;

        const testCreatePool = async (symbol: string) => {
            beforeEach(async () => {
                ({ network, networkSettings, networkToken, poolCollection } = await createSystem());

                reserveToken = await getTokenBySymbol(symbol, networkToken);

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
                        'ERR_TOKEN_NOT_WHITELISTED'
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
        };

        for (const symbol of ['ETH', 'TKN']) {
            context(symbol, () => {
                testCreatePool(symbol);
            });
        }
    });

    describe('withdraw', () => {
        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let networkToken: TestERC20Token;
        let govToken: TestERC20Token;
        let govTokenGovernance: TokenGovernance;
        let networkTokenPool: TestNetworkTokenPool;
        let poolCollection: TestPoolCollection;
        let vault: BancorVault;
        let pendingWithdrawals: TestPendingWithdrawals;
        let networkPoolToken: PoolToken;
        let externalProtectionWallet: TokenHolderUpgradeable;

        const MAX_DEVIATION = BigNumber.from(10_000); // %1
        const MINTING_LIMIT = toWei(BigNumber.from(10_000_000));
        const WITHDRAWAL_FEE = BigNumber.from(50_000); // 5%

        const setTime = async (time: number) => {
            await network.setTime(time);
            await pendingWithdrawals.setTime(time);
        };

        beforeEach(async () => {
            ({
                network,
                networkSettings,
                networkToken,
                govToken,
                govTokenGovernance,
                networkTokenPool,
                poolCollection,
                vault,
                pendingWithdrawals,
                networkPoolToken
            } = await createSystem());

            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);
            await networkSettings.setWithdrawalFeePPM(WITHDRAWAL_FEE);

            externalProtectionWallet = await createTokenHolder();
            await externalProtectionWallet.transferOwnership(network.address);
            await network.setExternalProtectionWallet(externalProtectionWallet.address);

            await setTime((await latest()).toNumber());
        });

        it('should revert when to withdraw a non-existing withdrawal request', async () => {
            await expect(network.withdraw(BigNumber.from(12345))).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        const testWithdraw = async (symbol: string) => {
            const isNetworkToken = symbol === 'BNT';
            const isETH = symbol === 'ETH';

            context('with an initiated withdrawal request', () => {
                let deployer: SignerWithAddress;
                let provider: SignerWithAddress;
                let poolToken: PoolToken;
                let token: TokenWithAddress;
                const poolTokenAmount = BigNumber.from(2222222222222);
                let id: BigNumber;
                let creationTime: number;

                beforeEach(async () => {
                    [deployer, provider] = await ethers.getSigners();

                    token = await getTokenBySymbol(symbol, networkToken);

                    await networkSettings.setPoolMintingLimit(token.address, MINTING_LIMIT);

                    if (isNetworkToken) {
                        poolToken = networkPoolToken;

                        await networkTokenPool.mintT(provider.address, poolTokenAmount);
                    } else {
                        poolToken = await createPool(token, network, networkSettings, poolCollection);

                        await poolCollection.mintT(provider.address, poolToken.address, poolTokenAmount);
                    }

                    await poolToken.connect(provider).approve(pendingWithdrawals.address, poolTokenAmount);
                    await pendingWithdrawals.connect(provider).initWithdrawal(poolToken.address, poolTokenAmount);

                    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                    id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
                    const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
                    creationTime = withdrawalRequest.createdAt;
                });

                it('should revert when attempting to withdraw from a different provider', async () => {
                    await expect(network.connect(deployer).withdraw(id)).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                context('during the lock duration', () => {
                    beforeEach(async () => {
                        await setTime(creationTime + 1000);
                    });

                    it('should revert when attempting to withdraw', async () => {
                        await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                            'ERR_WITHDRAWAL_NOT_ALLOWED'
                        );
                    });

                    context('after the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await setTime(creationTime + withdrawalDuration + 1);
                        });

                        it('should revert when attempting to withdraw', async () => {
                            await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                'ERR_WITHDRAWAL_NOT_ALLOWED'
                            );
                        });
                    });

                    context('during the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await setTime(creationTime + withdrawalDuration - 1);
                        });

                        if (isNetworkToken) {
                            it('should revert when attempting to withdraw without approving the governance token amount', async () => {
                                await govTokenGovernance.mint(provider.address, poolTokenAmount);

                                await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                    'ERC20: transfer amount exceeds allowance'
                                );
                            });

                            it('should revert when attempting to withdraw with an insufficient governance token amount', async () => {
                                await govTokenGovernance.mint(provider.address, poolTokenAmount.sub(BigNumber.from(1)));
                                await govToken.connect(provider).approve(network.address, poolTokenAmount);

                                await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                    'ERC20: transfer amount exceeds balance'
                                );
                            });
                        }

                        context('with approvals', () => {
                            let contextId: string;

                            beforeEach(async () => {
                                contextId = solidityKeccak256(
                                    ['address', 'uint32', 'uint256'],
                                    [provider.address, await network.currentTime(), id]
                                );

                                if (isNetworkToken) {
                                    await govTokenGovernance.mint(provider.address, poolTokenAmount);
                                    await govToken.connect(provider).approve(network.address, poolTokenAmount);
                                }
                            });

                            if (!isNetworkToken) {
                                it('should revert when attempting to withdraw a non-whitelisted token', async () => {
                                    await networkSettings.removeTokenFromWhitelist(token.address);

                                    await expect(network.connect(provider).withdraw(id)).to.be.revertedWith(
                                        'ERR_TOKEN_NOT_WHITELISTED'
                                    );
                                });
                            }

                            context('when spot rate is stable', () => {
                                beforeEach(async () => {
                                    const spotRate = { n: BigNumber.from(1_000_000), d: BigNumber.from(1) };

                                    await poolCollection.setTradingLiquidityT(token.address, spotRate.n, spotRate.d);
                                    await poolCollection.setAverageRateT(token.address, {
                                        rate: {
                                            n: spotRate.n.mul(PPM_RESOLUTION),
                                            d: spotRate.d.mul(
                                                PPM_RESOLUTION.add(MAX_DEVIATION.sub(BigNumber.from(1000)))
                                            )
                                        },
                                        time: await network.currentTime()
                                    });
                                });

                                it('should complete a withdraw', async () => {
                                    const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                                    const prevPoolPoolTokenBalance = await poolToken.balanceOf(
                                        networkTokenPool.address
                                    );
                                    const prevCollectionPoolTokenBalance = await poolToken.balanceOf(
                                        poolCollection.address
                                    );
                                    const prevProviderPoolTokenBalance = await poolToken.balanceOf(provider.address);

                                    const prevProviderTokenBalance = await getBalance(token, provider.address);

                                    const prevGovTotalSupply = await govToken.totalSupply();
                                    const prevPoolGovTokenBalance = await govToken.balanceOf(networkTokenPool.address);
                                    const prevProviderGovTokenBalance = await govToken.balanceOf(provider.address);

                                    if (isNetworkToken) {
                                        const withdrawalAmounts = await networkTokenPool.withdrawalAmountsT(
                                            poolTokenAmount
                                        );

                                        const res = await network.connect(provider).withdraw(id);

                                        await expect(res)
                                            .to.emit(network, 'FundsWithdrawn')
                                            .withArgs(
                                                contextId,
                                                token.address,
                                                provider.address,
                                                ZERO_ADDRESS,
                                                poolTokenAmount,
                                                poolTokenAmount,
                                                BigNumber.from(0),
                                                BigNumber.from(0),
                                                withdrawalAmounts.networkTokenAmount,
                                                withdrawalAmounts.networkTokenWithdrawalFeeAmount
                                            );

                                        await expect(res)
                                            .to.emit(network, 'TotalLiquidityUpdated')
                                            .withArgs(
                                                contextId,
                                                token.address,
                                                await poolToken.totalSupply(),
                                                await networkTokenPool.stakedBalance(),
                                                await getBalance(token, vault.address)
                                            );

                                        expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                                        expect(await poolToken.balanceOf(networkTokenPool.address)).to.equal(
                                            prevPoolPoolTokenBalance.add(poolTokenAmount)
                                        );

                                        expect(await govToken.totalSupply()).to.equal(
                                            prevGovTotalSupply.sub(poolTokenAmount)
                                        );

                                        expect(await govToken.balanceOf(provider.address)).to.equal(
                                            prevProviderGovTokenBalance.sub(poolTokenAmount)
                                        );

                                        // sanity test:
                                        expect(await getBalance(token, provider.address)).to.be.gte(
                                            prevProviderTokenBalance
                                        );
                                    } else {
                                        const withdrawalAmounts = await poolCollection.poolWithdrawalAmountsT(
                                            token.address,
                                            poolTokenAmount,
                                            await getBalance(token, vault.address),
                                            await getBalance(token, externalProtectionWallet.address)
                                        );

                                        const res = await network.connect(provider).withdraw(id);

                                        let transactionCost = BigNumber.from(0);
                                        if (isETH) {
                                            transactionCost = await getTransactionCost(res);
                                        }

                                        await expect(res)
                                            .to.emit(network, 'FundsWithdrawn')
                                            .withArgs(
                                                contextId,
                                                token.address,
                                                provider.address,
                                                poolCollection.address,
                                                poolTokenAmount,
                                                BigNumber.from(0),
                                                withdrawalAmounts.baseTokenAmountToTransferFromVaultToProvider,
                                                withdrawalAmounts.baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
                                                withdrawalAmounts.networkTokenAmountToMintForProvider,
                                                withdrawalAmounts.baseTokenWithdrawalFeeAmount
                                            );

                                        const poolLiquidity = await poolCollection.poolLiquidity(token.address);

                                        await expect(res)
                                            .to.emit(network, 'TotalLiquidityUpdated')
                                            .withArgs(
                                                contextId,
                                                token.address,
                                                await poolToken.totalSupply(),
                                                poolLiquidity.stakedBalance,
                                                await getBalance(token, vault.address)
                                            );

                                        if (
                                            withdrawalAmounts.baseTokenAmountToTransferFromVaultToProvider.gt(
                                                BigNumber.from(0)
                                            )
                                        ) {
                                            await expect(res)
                                                .to.emit(network, 'TradingLiquidityUpdated')
                                                .withArgs(
                                                    contextId,
                                                    token.address,
                                                    token.address,
                                                    poolLiquidity.baseTokenTradingLiquidity
                                                );
                                        }

                                        if (
                                            withdrawalAmounts.networkTokenAmountToMintForProvider.gt(BigNumber.from(0))
                                        ) {
                                            await expect(res)
                                                .to.emit(network, 'TradingLiquidityUpdated')
                                                .withArgs(
                                                    contextId,
                                                    token.address,
                                                    networkToken.address,
                                                    poolLiquidity.networkTokenTradingLiquidity
                                                );
                                        }

                                        expect(await poolToken.totalSupply()).to.equal(
                                            prevPoolTokenTotalSupply.sub(poolTokenAmount)
                                        );
                                        expect(await poolToken.balanceOf(networkTokenPool.address)).to.equal(
                                            prevPoolPoolTokenBalance
                                        );

                                        expect(await govToken.totalSupply()).to.equal(prevGovTotalSupply);
                                        expect(await govToken.balanceOf(provider.address)).to.equal(
                                            prevProviderGovTokenBalance
                                        );

                                        // sanity test:
                                        expect(await getBalance(token, provider.address)).to.be.gte(
                                            prevProviderTokenBalance.sub(transactionCost)
                                        );
                                    }

                                    expect(await poolToken.balanceOf(poolCollection.address)).to.equal(
                                        prevCollectionPoolTokenBalance
                                    );
                                    expect(await poolToken.balanceOf(provider.address)).to.equal(
                                        prevProviderPoolTokenBalance
                                    );

                                    expect(await govToken.balanceOf(networkTokenPool.address)).to.equal(
                                        prevPoolGovTokenBalance
                                    );

                                    // TODO: test actual amounts
                                    // TODO: test request/renounce liquidity
                                    // TODO: test vault and external storage balances
                                });
                            });
                        });
                    });
                });
            });
        };

        for (const symbol of ['BNT', 'ETH', 'TKN']) {
            context(symbol, () => {
                testWithdraw(symbol);
            });
        }
    });
});
