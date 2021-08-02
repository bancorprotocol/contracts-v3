import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { BigNumber, Wallet, Signer } from 'ethers';
import { formatBytes32String } from 'ethers/lib/utils';
import { ethers } from 'hardhat';
import { ZERO_ADDRESS, MAX_UINT256 } from 'test/helpers/Constants';
import { createSystem, createPool } from 'test/helpers/Factory';
import { permitSignature } from 'test/helpers/Permit';
import { shouldHaveGap } from 'test/helpers/Proxy';
import { duration, latest } from 'test/helpers/Time';
import {
    TestPendingWithdrawals,
    NetworkSettings,
    TestERC20Token,
    TestBancorNetwork,
    TestLiquidityPoolCollection,
    TestNetworkTokenPool,
    PoolToken
} from 'typechain';

describe('PendingWithdrawals', () => {
    const WITHDRAWAL_REQUEST_DATA_VERSION = BigNumber.from(1);
    const DEFAULT_LOCK_DURATION = duration.days(7);
    const DEFAULT_WITHDRAWAL_WINDOW_DURATION = duration.days(3);

    let nonOwner: SignerWithAddress;
    let dummy: SignerWithAddress;

    shouldHaveGap('PendingWithdrawals', '_lockDuration');

    before(async () => {
        [, nonOwner, dummy] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { pendingWithdrawals } = await createSystem();

            await expect(pendingWithdrawals.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should revert when initialized with an invalid network contract', async () => {
            await expect(Contracts.PendingWithdrawals.deploy(ZERO_ADDRESS, dummy.address)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should revert when initialized with an invalid network token pool contract', async () => {
            await expect(Contracts.PendingWithdrawals.deploy(dummy.address, ZERO_ADDRESS)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should be properly initialized', async () => {
            const { pendingWithdrawals, network, networkTokenPool } = await createSystem();

            expect(await pendingWithdrawals.version()).to.equal(1);

            expect(await pendingWithdrawals.network()).to.equal(network.address);
            expect(await pendingWithdrawals.networkTokenPool()).to.equal(networkTokenPool.address);
            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
        });
    });

    describe('lock duration', () => {
        const newLockDuration = duration.days(1);
        let pendingWithdrawals: TestPendingWithdrawals;

        beforeEach(async () => {
            ({ pendingWithdrawals } = await createSystem());

            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
        });

        it('should revert when a non-owner attempts to set the lock duration', async () => {
            await expect(pendingWithdrawals.connect(nonOwner).setLockDuration(newLockDuration)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should be to able to set and update the lock duration', async () => {
            const res = await pendingWithdrawals.setLockDuration(newLockDuration);
            await expect(res)
                .to.emit(pendingWithdrawals, 'LockDurationUpdated')
                .withArgs(DEFAULT_LOCK_DURATION, newLockDuration);

            expect(await pendingWithdrawals.lockDuration()).to.equal(newLockDuration);

            const res2 = await pendingWithdrawals.setLockDuration(DEFAULT_LOCK_DURATION);
            await expect(res2)
                .to.emit(pendingWithdrawals, 'LockDurationUpdated')
                .withArgs(newLockDuration, DEFAULT_LOCK_DURATION);

            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
        });
    });

    describe('withdrawal window duration', () => {
        const newWithdrawalWindowDuration = duration.weeks(2);
        let pendingWithdrawals: TestPendingWithdrawals;

        beforeEach(async () => {
            ({ pendingWithdrawals } = await createSystem());

            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
        });

        it('should revert when a non-owner attempts to set the withdrawal window duration', async () => {
            await expect(
                pendingWithdrawals.connect(nonOwner).setWithdrawalWindowDuration(newWithdrawalWindowDuration)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be to able to set and update the withdrawal window duration', async () => {
            const res = await pendingWithdrawals.setWithdrawalWindowDuration(newWithdrawalWindowDuration);
            await expect(res)
                .to.emit(pendingWithdrawals, 'WithdrawalWindowDurationUpdated')
                .withArgs(DEFAULT_WITHDRAWAL_WINDOW_DURATION, newWithdrawalWindowDuration);

            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(newWithdrawalWindowDuration);

            const res2 = await pendingWithdrawals.setWithdrawalWindowDuration(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
            await expect(res2)
                .to.emit(pendingWithdrawals, 'WithdrawalWindowDurationUpdated')
                .withArgs(newWithdrawalWindowDuration, DEFAULT_WITHDRAWAL_WINDOW_DURATION);

            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
        });
    });

    describe('withdrawals', () => {
        let reserveToken: TestERC20Token;
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkTokenPool: TestNetworkTokenPool;
        let pendingWithdrawals: TestPendingWithdrawals;
        let collection: TestLiquidityPoolCollection;

        beforeEach(async () => {
            ({ network, networkSettings, networkTokenPool, pendingWithdrawals, collection } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));

            await pendingWithdrawals.setTime(await latest());
        });

        describe('initiation', () => {
            const test = (delegated: boolean = false) => {
                let provider: Signer | Wallet;
                let providerAddress: string;
                let providerNonce: BigNumber;

                beforeEach(async () => {
                    provider = delegated ? Wallet.createRandom() : (await ethers.getSigners())[9];
                    providerAddress = await provider.getAddress();
                    providerNonce = BigNumber.from(0);
                });

                const initWithdrawal = async (poolToken: PoolToken, amount: BigNumber) => {
                    if (!delegated) {
                        await poolToken.connect(provider).approve(pendingWithdrawals.address, amount);

                        return pendingWithdrawals.connect(provider).initWithdrawal(poolToken.address, amount);
                    }

                    const { v, r, s } = await permitSignature(
                        provider as Wallet,
                        await poolToken.name(),
                        poolToken.address,
                        pendingWithdrawals.address,
                        amount,
                        providerNonce,
                        MAX_UINT256
                    );

                    providerNonce = providerNonce.add(BigNumber.from(1));

                    return pendingWithdrawals.initWithdrawalDelegated(
                        poolToken.address,
                        amount,
                        providerAddress,
                        MAX_UINT256,
                        v,
                        r,
                        s
                    );
                };

                const testInitWithdrawal = async (poolToken: PoolToken, amount: BigNumber) => {
                    const providerBalance = await poolToken.balanceOf(providerAddress);
                    const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                    const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(providerAddress);

                    const res = await initWithdrawal(poolToken, amount);
                    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(providerAddress);
                    const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];

                    await expect(res)
                        .to.emit(pendingWithdrawals, 'WithdrawalInitiated')
                        .withArgs(reserveToken.address, providerAddress, id, amount);

                    expect(await poolToken.balanceOf(providerAddress)).to.equal(providerBalance.sub(amount));
                    expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                        pendingWithdrawalsBalance.add(amount)
                    );
                    expect(await pendingWithdrawals.withdrawalRequestCount(providerAddress)).to.equal(
                        withdrawalRequestCount.add(BigNumber.from(1))
                    );

                    const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
                    expect(withdrawalRequest.version).to.equal(WITHDRAWAL_REQUEST_DATA_VERSION);
                    expect(withdrawalRequest.provider).to.equal(providerAddress);
                    expect(withdrawalRequest.poolToken).to.equal(poolToken.address);
                    expect(withdrawalRequest.amount).to.equal(amount);
                    expect(withdrawalRequest.createdAt).to.equal(await pendingWithdrawals.currentTime());
                };

                it('should revert when attempting to withdraw from an invalid pool', async () => {
                    const poolToken = await Contracts.PoolToken.deploy('POOL', 'POOL', reserveToken.address);
                    const amount = BigNumber.from(1);

                    if (!delegated) {
                        await expect(pendingWithdrawals.initWithdrawal(ZERO_ADDRESS, amount)).to.be.revertedWith(
                            'ERR_INVALID_ADDRESS'
                        );

                        await expect(pendingWithdrawals.initWithdrawal(poolToken.address, amount)).to.be.revertedWith(
                            'ERR_INVALID_POOL'
                        );
                    } else {
                        const { v, r, s } = await permitSignature(
                            provider as Wallet,
                            await poolToken.name(),
                            poolToken.address,
                            pendingWithdrawals.address,
                            amount,
                            providerNonce,
                            MAX_UINT256
                        );

                        await expect(
                            pendingWithdrawals.initWithdrawalDelegated(
                                ZERO_ADDRESS,
                                BigNumber.from(1),
                                providerAddress,
                                MAX_UINT256,
                                v,
                                r,
                                s
                            )
                        ).to.be.revertedWith('ERR_INVALID_ADDRESS');

                        await expect(
                            pendingWithdrawals.initWithdrawalDelegated(
                                poolToken.address,
                                BigNumber.from(1),
                                providerAddress,
                                MAX_UINT256,
                                v,
                                r,
                                s
                            )
                        ).to.be.revertedWith('ERR_INVALID_POOL');
                    }
                });

                context('with an associated collection and whitelisted token', () => {
                    let poolToken: PoolToken;

                    beforeEach(async () => {
                        poolToken = await createPool(reserveToken, network, networkSettings, collection);
                    });

                    it('should revert when attempting to withdraw an invalid amount of pool tokens', async () => {
                        const providerBalance = await poolToken.balanceOf(providerAddress);
                        await expect(
                            initWithdrawal(poolToken, providerBalance.add(BigNumber.from(1)))
                        ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                    });

                    context('with a pool token balance', () => {
                        const amount = BigNumber.from(12345);

                        beforeEach(async () => {
                            await collection.mint(providerAddress, poolToken.address, amount);
                        });

                        it('should revert when attempting to withdraw an invalid amount of pool tokens', async () => {
                            await expect(initWithdrawal(poolToken, amount.add(BigNumber.from(1)))).to.be.revertedWith(
                                'ERC20: transfer amount exceeds balance'
                            );
                        });

                        it('should init a withdraw', async () => {
                            await testInitWithdrawal(poolToken, amount);
                        });

                        it('should init multiple withdraws', async () => {
                            const withdrawals = 3;
                            for (let i = 0; i < withdrawals; i++) {
                                await testInitWithdrawal(poolToken, amount.div(BigNumber.from(withdrawals)));
                            }
                        });
                    });
                });
            };

            for (const delegated of [false, true]) {
                context(delegated ? 'delegated' : 'direct', async () => {
                    test(delegated);
                });
            }
        });

        describe('cancellation', () => {
            let provider1: SignerWithAddress;
            let provider2: SignerWithAddress;
            let poolToken: PoolToken;
            const amount = BigNumber.from(9999999);

            beforeEach(async () => {
                [, provider1, provider2] = await ethers.getSigners();

                poolToken = await createPool(reserveToken, network, networkSettings, collection);

                await collection.mint(provider1.address, poolToken.address, amount);
                await collection.mint(provider2.address, poolToken.address, amount);
            });

            it('should revert when cancelling a non-existing withdrawal request', async () => {
                await expect(pendingWithdrawals.cancelWithdrawal(BigNumber.from(1))).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            context('with initiated withdrawal requests', () => {
                const testCancelWithdrawal = async (provider: SignerWithAddress, id: BigNumber) => {
                    const providerBalance = await poolToken.balanceOf(provider.address);
                    const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                    const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(provider.address);
                    const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);

                    const res = await pendingWithdrawals.connect(provider).cancelWithdrawal(id);
                    await expect(res)
                        .to.emit(pendingWithdrawals, 'WithdrawalCancelled')
                        .withArgs(
                            reserveToken.address,
                            provider.address,
                            id,
                            withdrawalRequest.amount,
                            (await pendingWithdrawals.currentTime()).sub(withdrawalRequest.createdAt)
                        );

                    expect(await poolToken.balanceOf(provider.address)).to.equal(
                        providerBalance.add(withdrawalRequest.amount)
                    );
                    expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                        pendingWithdrawalsBalance.sub(withdrawalRequest.amount)
                    );
                    expect(await pendingWithdrawals.withdrawalRequestCount(provider.address)).to.equal(
                        withdrawalRequestCount.sub(BigNumber.from(1))
                    );
                    expect(await pendingWithdrawals.withdrawalRequestIds(provider.address)).not.to.have.members([id]);
                };

                let id1: BigNumber;
                let id2: BigNumber;

                beforeEach(async () => {
                    await poolToken.connect(provider1).approve(pendingWithdrawals.address, amount);

                    const withdrawalAmount1 = BigNumber.from(1111);
                    await pendingWithdrawals.connect(provider1).initWithdrawal(poolToken.address, withdrawalAmount1);
                    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider1.address);
                    id1 = withdrawalRequestIds[withdrawalRequestIds.length - 1];

                    const withdrawalAmount2 = amount.sub(withdrawalAmount1);
                    await pendingWithdrawals.connect(provider1).initWithdrawal(poolToken.address, withdrawalAmount2);
                    const withdrawalRequestIds2 = await pendingWithdrawals.withdrawalRequestIds(provider1.address);
                    id2 = withdrawalRequestIds2[withdrawalRequestIds2.length - 1];
                });

                it("should revert when attempting to cancel another provider's request", async () => {
                    await poolToken.connect(provider2).approve(pendingWithdrawals.address, amount);
                    await pendingWithdrawals.connect(provider2).initWithdrawal(poolToken.address, amount);
                    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider2.address);
                    const provider2Id = withdrawalRequestIds[0];

                    await expect(
                        pendingWithdrawals.connect(provider1).cancelWithdrawal(provider2Id)
                    ).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                it('should revert when cancelling a withdrawal request twice', async () => {
                    await pendingWithdrawals.connect(provider1).cancelWithdrawal(id1);
                    await expect(pendingWithdrawals.connect(provider1).cancelWithdrawal(id1)).to.be.revertedWith(
                        'ERR_ACCESS_DENIED'
                    );
                });

                it('should cancel withdrawal requests', async () => {
                    await testCancelWithdrawal(provider1, id1);
                    await testCancelWithdrawal(provider1, id2);
                });
            });
        });

        describe('reinitiation', () => {
            let provider1: SignerWithAddress;
            let provider2: SignerWithAddress;
            let poolToken: PoolToken;
            const amount = BigNumber.from(9999999);

            beforeEach(async () => {
                [, provider1, provider2] = await ethers.getSigners();

                poolToken = await createPool(reserveToken, network, networkSettings, collection);

                await collection.mint(provider1.address, poolToken.address, amount);
                await collection.mint(provider2.address, poolToken.address, amount);
            });

            it('should revert when attempting to reinitiate a non-existing withdrawal request', async () => {
                await expect(pendingWithdrawals.reinitWithdrawal(BigNumber.from(1))).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            context('with initiated withdrawal requests', () => {
                const testReinitWithdrawal = async (provider: SignerWithAddress, id: BigNumber) => {
                    const providerBalance = await poolToken.balanceOf(provider.address);
                    const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                    const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(provider.address);
                    const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);

                    await pendingWithdrawals.setTime(withdrawalRequest.createdAt.add(duration.days(1)));

                    const res = await pendingWithdrawals.connect(provider).reinitWithdrawal(id);
                    await expect(res)
                        .to.emit(pendingWithdrawals, 'WithdrawalReinitiated')
                        .withArgs(
                            reserveToken.address,
                            provider.address,
                            id,
                            withdrawalRequest.amount,
                            (await pendingWithdrawals.currentTime()).sub(withdrawalRequest.createdAt)
                        );

                    expect(await poolToken.balanceOf(provider.address)).to.equal(providerBalance);
                    expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(pendingWithdrawalsBalance);
                    expect(await pendingWithdrawals.withdrawalRequestCount(provider.address)).to.equal(
                        withdrawalRequestCount
                    );

                    const withdrawalRequest2 = await pendingWithdrawals.withdrawalRequest(id);
                    expect(withdrawalRequest2.version).to.equal(withdrawalRequest.version);
                    expect(withdrawalRequest2.provider).to.equal(withdrawalRequest.provider);
                    expect(withdrawalRequest2.poolToken).to.equal(withdrawalRequest.poolToken);
                    expect(withdrawalRequest2.amount).to.equal(withdrawalRequest.amount);
                    expect(withdrawalRequest2.createdAt).to.gte(await pendingWithdrawals.currentTime());
                    expect(withdrawalRequest2.createdAt).not.to.equal(withdrawalRequest.createdAt);
                };

                let id1: BigNumber;
                let id2: BigNumber;

                beforeEach(async () => {
                    await poolToken.connect(provider1).approve(pendingWithdrawals.address, amount);

                    const withdrawalAmount1 = BigNumber.from(1111);
                    await pendingWithdrawals.connect(provider1).initWithdrawal(poolToken.address, withdrawalAmount1);
                    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider1.address);
                    id1 = withdrawalRequestIds[withdrawalRequestIds.length - 1];

                    const withdrawalAmount2 = amount.sub(withdrawalAmount1);
                    await pendingWithdrawals.connect(provider1).initWithdrawal(poolToken.address, withdrawalAmount2);
                    const withdrawalRequestIds2 = await pendingWithdrawals.withdrawalRequestIds(provider1.address);
                    id2 = withdrawalRequestIds2[withdrawalRequestIds2.length - 1];
                });

                it("should revert when attempting to reinitiate another provider's request", async () => {
                    await poolToken.connect(provider2).approve(pendingWithdrawals.address, amount);
                    await pendingWithdrawals.connect(provider2).initWithdrawal(poolToken.address, amount);
                    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider2.address);
                    const provider2Id = withdrawalRequestIds[0];

                    await expect(
                        pendingWithdrawals.connect(provider1).reinitWithdrawal(provider2Id)
                    ).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                it('should reinitiate withdrawal requests', async () => {
                    await testReinitWithdrawal(provider1, id1);
                    await testReinitWithdrawal(provider1, id2);
                });
            });
        });

        describe('completion', () => {
            let provider: SignerWithAddress;

            const test = async (networkToken: boolean) => {
                let poolToken: PoolToken;
                const poolTokenAmount = BigNumber.from(9889898923324);
                const contextId = formatBytes32String('CTX');

                beforeEach(async () => {
                    [, provider] = await ethers.getSigners();

                    if (networkToken) {
                        poolToken = await Contracts.PoolToken.attach(await networkTokenPool.poolToken());

                        await networkTokenPool.mint(provider.address, poolTokenAmount);
                    } else {
                        poolToken = await createPool(reserveToken, network, networkSettings, collection);

                        await collection.mint(provider.address, poolToken.address, poolTokenAmount);
                    }
                });

                it('should revert when attempting to complete a non-existing withdrawal request', async () => {
                    await expect(
                        pendingWithdrawals.completeWithdrawal(contextId, provider.address, BigNumber.from(100))
                    ).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                context('with initiated withdrawal requests', () => {
                    let id: BigNumber;
                    let creationTime: BigNumber;

                    const testCompleteWithdrawal = async () => {
                        const caller = networkToken ? networkTokenPool : collection;
                        const providerBalance = await poolToken.balanceOf(provider.address);
                        const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                        const callerBalance = await poolToken.balanceOf(caller.address);
                        const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(
                            provider.address
                        );
                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);

                        const retPoolTokenAmount = await caller.callStatic.completeWithdrawalT(
                            pendingWithdrawals.address,
                            contextId,
                            provider.address,

                            id
                        );
                        expect(retPoolTokenAmount).to.equal(withdrawalRequest.amount);

                        const res = await caller.completeWithdrawalT(
                            pendingWithdrawals.address,
                            contextId,
                            provider.address,
                            id
                        );

                        await expect(res)
                            .to.emit(pendingWithdrawals, 'WithdrawalCompleted')
                            .withArgs(
                                contextId,
                                networkToken ? await network.networkToken() : reserveToken.address,
                                provider.address,
                                id,
                                withdrawalRequest.amount,
                                (await pendingWithdrawals.currentTime()).sub(withdrawalRequest.createdAt)
                            );

                        expect(await poolToken.balanceOf(provider.address)).to.equal(providerBalance);
                        expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                            pendingWithdrawalsBalance.sub(withdrawalRequest.amount)
                        );
                        expect(await poolToken.balanceOf(caller.address)).to.equal(
                            callerBalance.add(withdrawalRequest.amount)
                        );
                        expect(await pendingWithdrawals.withdrawalRequestCount(provider.address)).to.equal(
                            withdrawalRequestCount.sub(BigNumber.from(1))
                        );
                        expect(await pendingWithdrawals.withdrawalRequestIds(provider.address)).not.to.have.members([
                            id
                        ]);
                    };

                    beforeEach(async () => {
                        await poolToken.connect(provider).approve(pendingWithdrawals.address, poolTokenAmount);
                        await pendingWithdrawals.connect(provider).initWithdrawal(poolToken.address, poolTokenAmount);

                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                        id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
                        creationTime = withdrawalRequest.createdAt;
                    });

                    it('should revert when attempting to complete a withdrawal request from an incorrect caller', async () => {
                        await expect(
                            pendingWithdrawals.connect(provider).completeWithdrawal(contextId, provider.address, id)
                        ).to.be.revertedWith('ERR_ACCESS_DENIED');

                        await expect(
                            (networkToken ? collection : networkTokenPool).completeWithdrawalT(
                                pendingWithdrawals.address,
                                contextId,
                                provider.address,
                                id
                            )
                        ).to.be.revertedWith('ERR_ACCESS_DENIED');
                    });

                    context('during the lock duration', () => {
                        beforeEach(async () => {
                            await pendingWithdrawals.setTime(creationTime.add(duration.hours(1)));
                        });

                        it('should revert when attempting to complete a withdrawal request', async () => {
                            await expect(testCompleteWithdrawal()).to.be.revertedWith('ERR_WITHDRAWAL_NOT_ALLOWED');
                        });
                    });

                    context('after the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration = (await pendingWithdrawals.lockDuration()).add(
                                await pendingWithdrawals.withdrawalWindowDuration()
                            );
                            await pendingWithdrawals.setTime(
                                creationTime.add(withdrawalDuration.add(duration.seconds(1)))
                            );
                        });

                        it('should revert when attempting to complete a withdrawal request', async () => {
                            await expect(testCompleteWithdrawal()).to.be.revertedWith('ERR_WITHDRAWAL_NOT_ALLOWED');
                        });
                    });

                    context('during the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration = (await pendingWithdrawals.lockDuration()).add(
                                await pendingWithdrawals.withdrawalWindowDuration()
                            );
                            await pendingWithdrawals.setTime(
                                creationTime.add(withdrawalDuration.sub(duration.seconds(1)))
                            );
                        });

                        it('should complete a withdrawal request', async () => {
                            await testCompleteWithdrawal();
                        });
                    });
                });
            };

            for (const networkToken of [false, true]) {
                context(networkToken ? 'network token pool' : 'base token pool', async () => {
                    test(networkToken);
                });
            }
        });
    });
});
