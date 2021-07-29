import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { BigNumber, Wallet, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { ZERO_ADDRESS, MAX_UINT256 } from 'test/helpers/Constants';
import { createSystem, createPool } from 'test/helpers/Factory';
import { permitSignature } from 'test/helpers/Permit';
import { shouldHaveGap } from 'test/helpers/Proxy';
import { duration, latest } from 'test/helpers/Time';
import {
    PendingWithdrawals,
    NetworkSettings,
    TestERC20Token,
    TestBancorNetwork,
    TestLiquidityPoolCollection,
    PoolToken
} from 'typechain';

describe('PendingWithdrawals', () => {
    const DEFAULT_LOCK_DURATION = duration.days(7);
    const DEFAULT_WITHDRAWAL_WINDOW_DURATION = duration.days(3);

    let nonOwner: SignerWithAddress;
    let dummy: SignerWithAddress;

    shouldHaveGap('PendingWithdrawals', '_positions');

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
        let pendingWithdrawals: PendingWithdrawals;

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
        let pendingWithdrawals: PendingWithdrawals;

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
        let pendingWithdrawals: PendingWithdrawals;
        let collection: TestLiquidityPoolCollection;

        beforeEach(async () => {
            ({ network, networkSettings, pendingWithdrawals, collection } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy('TKN', 'TKN', BigNumber.from(1_000_000));
        });

        describe('initiation', () => {
            const testInit = (delegated: boolean = false) => {
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
                    const index = withdrawalRequestCount;

                    await expect(res)
                        .to.emit(pendingWithdrawals, 'WithdrawalInitiated')
                        .withArgs(reserveToken.address, providerAddress, id, amount);

                    expect(await poolToken.balanceOf(providerAddress)).to.equal(providerBalance.sub(amount));
                    expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                        pendingWithdrawalsBalance.add(amount)
                    );
                    expect(await pendingWithdrawals.withdrawalRequestCount(providerAddress)).to.equal(
                        index.add(BigNumber.from(1))
                    );

                    const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
                    expect(withdrawalRequest.provider).to.equal(providerAddress);
                    expect(withdrawalRequest.poolToken).to.equal(poolToken.address);
                    expect(withdrawalRequest.index).to.equal(index);
                    expect(withdrawalRequest.amount).to.equal(amount);
                    expect(withdrawalRequest.createdAt).to.equal(await latest());
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
                    testInit(delegated);
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
                            (await latest()).sub(withdrawalRequest.createdAt)
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
    });
});
