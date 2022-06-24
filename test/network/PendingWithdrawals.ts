import Contracts, {
    BancorNetworkInfo,
    IERC20,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestBNTPool,
    TestPendingWithdrawals,
    TestPoolCollection
} from '../../components/Contracts';
import { DEFAULT_LOCK_DURATION, ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { createSystem, depositToPool, setupFundedPool, TokenWithAddress } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('PendingWithdrawals', () => {
    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;

    shouldHaveGap('PendingWithdrawals', '_lockDuration');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let pendingWithdrawals: TestPendingWithdrawals;

        beforeEach(async () => {
            ({ network, bnt, bntPool, pendingWithdrawals } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.PendingWithdrawals.deploy(ZERO_ADDRESS, bnt.address, bntPool.address)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT contract', async () => {
            await expect(
                Contracts.PendingWithdrawals.deploy(network.address, ZERO_ADDRESS, bntPool.address)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT pool contract', async () => {
            await expect(
                Contracts.PendingWithdrawals.deploy(network.address, bnt.address, ZERO_ADDRESS)
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(pendingWithdrawals.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await pendingWithdrawals.version()).to.equal(4);

            await expectRoles(pendingWithdrawals, Roles.Upgradeable);

            await expectRole(pendingWithdrawals, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);

            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
        });

        it('should emit events on initialization', async () => {
            const pendingWithdrawals = await Contracts.PendingWithdrawals.deploy(
                network.address,
                bnt.address,
                bntPool.address
            );
            const res = await pendingWithdrawals.initialize();
            await expect(res).to.emit(pendingWithdrawals, 'LockDurationUpdated').withArgs(0, DEFAULT_LOCK_DURATION);
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
            await expect(pendingWithdrawals.connect(nonOwner).setLockDuration(newLockDuration)).to.be.revertedWithError(
                'AccessDenied'
            );
        });

        it('should ignore updating to the same lock duration', async () => {
            await pendingWithdrawals.setLockDuration(newLockDuration);

            const res = await pendingWithdrawals.setLockDuration(newLockDuration);
            await expect(res).not.to.emit(pendingWithdrawals, 'LockDurationUpdated');
        });

        it('should be able to set and update the lock duration', async () => {
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

    describe('withdrawals', () => {
        let poolToken: PoolToken;
        let reserveToken: TokenWithAddress;
        let networkInfo: BancorNetworkInfo;
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bntPool: TestBNTPool;
        let bntPoolToken: PoolToken;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolCollection: TestPoolCollection;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(100_000);

        const testWithdrawals = (tokenData: TokenData) => {
            beforeEach(async () => {
                ({ network, networkInfo, networkSettings, bntPool, bntPoolToken, pendingWithdrawals, poolCollection } =
                    await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                await pendingWithdrawals.setTime(await latest());
            });

            const poolTokenToUnderlying = async (poolToken: PoolToken, amount: BigNumber) => {
                let stakedBalance: BigNumber;
                if (bntPoolToken.address === poolToken.address) {
                    stakedBalance = await bntPool.stakedBalance();
                } else {
                    ({ stakedBalance } = await poolCollection.poolLiquidity(reserveToken.address));
                }

                return amount.mul(stakedBalance).div(await poolToken.totalSupply());
            };

            describe('initiation', () => {
                let provider: SignerWithAddress;

                before(async () => {
                    [, provider] = await ethers.getSigners();
                });

                const testInitWithdrawal = async (poolToken: PoolToken, amount: BigNumber) => {
                    const providerBalance = await poolToken.balanceOf(provider.address);
                    const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                    const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(provider.address);

                    const retId = await network.connect(provider).callStatic.initWithdrawal(poolToken.address, amount);
                    const res = await network.connect(provider).initWithdrawal(poolToken.address, amount);
                    const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                    const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
                    expect(id).to.equal(retId);

                    const reserveTokenAmount = await poolTokenToUnderlying(poolToken, amount);

                    await expect(res)
                        .to.emit(pendingWithdrawals, 'WithdrawalInitiated')
                        .withArgs(reserveToken.address, provider.address, id, amount, reserveTokenAmount);

                    expect(await pendingWithdrawals.isReadyForWithdrawal(id)).to.be.false;

                    expect(await poolToken.balanceOf(provider.address)).to.equal(providerBalance.sub(amount));
                    expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                        pendingWithdrawalsBalance.add(amount)
                    );
                    expect(await pendingWithdrawals.withdrawalRequestCount(provider.address)).to.equal(
                        withdrawalRequestCount.add(1)
                    );

                    const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
                    expect(withdrawalRequest.provider).to.equal(provider.address);
                    expect(withdrawalRequest.poolToken).to.equal(poolToken.address);
                    expect(withdrawalRequest.reserveToken).to.equal(reserveToken.address);
                    expect(withdrawalRequest.poolTokenAmount).to.equal(amount);
                    expect(withdrawalRequest.reserveTokenAmount).to.equal(reserveTokenAmount);
                    expect(withdrawalRequest.createdAt).to.equal(await pendingWithdrawals.currentTime());
                };

                context('with provided liquidity', () => {
                    let poolTokenAmount: BigNumber;

                    beforeEach(async () => {
                        ({ poolToken, token: reserveToken } = await setupFundedPool(
                            {
                                tokenData: new TokenData(TokenSymbol.TKN),
                                balance: toWei(1_000_000),
                                requestedFunding: toWei(1_000_000).mul(1000),
                                bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                                baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                            },
                            provider as any as SignerWithAddress,
                            network,
                            networkInfo,
                            networkSettings,
                            poolCollection
                        ));

                        poolTokenAmount = await poolToken.balanceOf(provider.address);

                        await poolToken.connect(provider).approve(network.address, poolTokenAmount);
                    });

                    it('should revert when attempting to initiate a withdrawal request from a a non-network', async () => {
                        const nonNetwork = deployer;

                        await expect(
                            pendingWithdrawals
                                .connect(nonNetwork)
                                .initWithdrawal(provider.address, poolToken.address, 1)
                        ).to.be.revertedWithError('AccessDenied');
                    });

                    it('should revert when attempting to withdraw a zero amount of pool tokens', async () => {
                        await expect(
                            network.connect(provider).initWithdrawal(poolToken.address, 0)
                        ).to.be.revertedWithError('ZeroValue');
                    });

                    it('should revert when attempting to withdraw an invalid amount of pool tokens', async () => {
                        await expect(
                            network.connect(provider).initWithdrawal(poolToken.address, poolTokenAmount.add(1))
                        ).to.be.revertedWithError(new TokenData(TokenSymbol.TKN).errors().exceedsAllowance);
                    });

                    it('should revert when attempting to withdraw an insufficient amount of pool tokens', async () => {
                        const providerBalance = await poolToken.balanceOf(provider.address);
                        await expect(
                            network.connect(provider).initWithdrawal(poolToken.address, providerBalance.add(1))
                        ).to.be.revertedWithError(new TokenData(TokenSymbol.TKN).errors().exceedsAllowance);
                    });

                    it('should init a withdraw', async () => {
                        await testInitWithdrawal(poolToken, poolTokenAmount);
                    });

                    it('should init multiple withdraws', async () => {
                        const withdrawals = 3;
                        for (let i = 0; i < withdrawals; i++) {
                            await testInitWithdrawal(poolToken, poolTokenAmount.div(BigNumber.from(withdrawals + i)));
                        }
                    });
                });
            });

            describe('cancellation', () => {
                let provider: SignerWithAddress;
                let poolTokenAmount: BigNumber;

                before(async () => {
                    [, provider] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    ({ poolToken, token: reserveToken } = await setupFundedPool(
                        {
                            tokenData: new TokenData(TokenSymbol.TKN),
                            balance: toWei(1_000_000),
                            requestedFunding: toWei(1_000_000).mul(1000),
                            bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                            baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                        },
                        provider,
                        network,
                        networkInfo,
                        networkSettings,
                        poolCollection
                    ));

                    poolTokenAmount = await poolToken.balanceOf(provider.address);
                });

                it('should revert when cancelling a non-existing withdrawal request', async () => {
                    await expect(network.cancelWithdrawal(1)).to.be.revertedWithError('AccessDenied');
                });

                context('with initiated withdrawal requests', () => {
                    const testCancelWithdrawal = async (provider: SignerWithAddress, id: BigNumber) => {
                        const providerBalance = await poolToken.balanceOf(provider.address);
                        const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                        const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(
                            provider.address
                        );
                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);

                        const poolTokenAmount = await network.connect(provider).callStatic.cancelWithdrawal(id);
                        expect(poolTokenAmount).to.equal(withdrawalRequest.poolTokenAmount);

                        const res = await network.connect(provider).cancelWithdrawal(id);
                        await expect(res)
                            .to.emit(pendingWithdrawals, 'WithdrawalCancelled')
                            .withArgs(
                                reserveToken.address,
                                provider.address,
                                id,
                                withdrawalRequest.poolTokenAmount,
                                withdrawalRequest.reserveTokenAmount,
                                (await pendingWithdrawals.currentTime()) - withdrawalRequest.createdAt
                            );

                        expect(await pendingWithdrawals.isReadyForWithdrawal(id)).to.be.false;

                        expect(await poolToken.balanceOf(provider.address)).to.equal(
                            providerBalance.add(withdrawalRequest.poolTokenAmount)
                        );
                        expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                            pendingWithdrawalsBalance.sub(withdrawalRequest.poolTokenAmount)
                        );
                        expect(await pendingWithdrawals.withdrawalRequestCount(provider.address)).to.equal(
                            withdrawalRequestCount.sub(1)
                        );
                        expect(await pendingWithdrawals.withdrawalRequestIds(provider.address)).not.to.have.members([
                            id
                        ]);
                    };

                    let id1: BigNumber;
                    let id2: BigNumber;

                    beforeEach(async () => {
                        await poolToken.connect(provider).approve(network.address, poolTokenAmount);

                        const withdrawalAmount1 = BigNumber.from(1111);
                        await network.connect(provider).initWithdrawal(poolToken.address, withdrawalAmount1);
                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                        id1 = withdrawalRequestIds[withdrawalRequestIds.length - 1];

                        const withdrawalAmount2 = poolTokenAmount.sub(withdrawalAmount1);
                        await network.connect(provider).initWithdrawal(poolToken.address, withdrawalAmount2);
                        const withdrawalRequestIds2 = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                        id2 = withdrawalRequestIds2[withdrawalRequestIds2.length - 1];
                    });

                    it('should revert when attempting to cancel a withdrawal request from a a non-network', async () => {
                        const nonNetwork = deployer;

                        await expect(network.connect(nonNetwork).cancelWithdrawal(id1)).to.be.revertedWithError(
                            'AccessDenied'
                        );
                    });

                    it("should revert when attempting to cancel another provider's request", async () => {
                        const provider2 = (await ethers.getSigners())[5];

                        await depositToPool(provider2, reserveToken, 1000, network);
                        const poolTokenAmount2 = await poolToken.balanceOf(provider2.address);

                        await poolToken.connect(provider2).approve(network.address, poolTokenAmount2);
                        await network.connect(provider2).initWithdrawal(poolToken.address, poolTokenAmount2);
                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider2.address);
                        const provider2Id = withdrawalRequestIds[0];

                        await expect(network.connect(provider).cancelWithdrawal(provider2Id)).to.be.revertedWithError(
                            'AccessDenied'
                        );
                    });

                    it('should revert when cancelling a withdrawal request twice', async () => {
                        await network.connect(provider).cancelWithdrawal(id1);
                        await expect(network.connect(provider).cancelWithdrawal(id1)).to.be.revertedWithError(
                            'AccessDenied'
                        );
                    });

                    it('should cancel withdrawal requests', async () => {
                        await testCancelWithdrawal(provider, id1);
                        await testCancelWithdrawal(provider, id2);
                    });
                });
            });

            describe('completion', () => {
                let provider: SignerWithAddress;

                let poolToken: PoolToken;
                let poolTokenAmount: BigNumber;
                const CONTEXT_ID = formatBytes32String('CTX');

                before(async () => {
                    [, provider] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    ({ poolToken, token: reserveToken } = await setupFundedPool(
                        {
                            tokenData: new TokenData(TokenSymbol.TKN),
                            balance: toWei(1_000_000),
                            requestedFunding: toWei(1_000_000).mul(1000),
                            bntVirtualBalance: BNT_VIRTUAL_BALANCE,
                            baseTokenVirtualBalance: BASE_TOKEN_VIRTUAL_BALANCE
                        },
                        provider,
                        network,
                        networkInfo,
                        networkSettings,
                        poolCollection
                    ));

                    poolTokenAmount = await poolToken.balanceOf(provider.address);
                });

                it('should revert when attempting to complete a non-existing withdrawal request', async () => {
                    await expect(
                        pendingWithdrawals.completeWithdrawal(CONTEXT_ID, provider.address, 100)
                    ).to.be.revertedWithError('AccessDenied');
                });

                context('with an initiated withdrawal request', () => {
                    let id: BigNumber;
                    let creationTime: number;

                    const testCompleteWithdrawal = async () => {
                        const prevProviderBalance = await poolToken.balanceOf(provider.address);
                        const prevPendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                        const prevNetworkBalance = await poolToken.balanceOf(network.address);
                        const prevTotalSupply = await poolToken.totalSupply();
                        const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(
                            provider.address
                        );
                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);

                        const completedRequest = await network.callStatic.completeWithdrawalT(
                            CONTEXT_ID,
                            provider.address,
                            id
                        );
                        expect(completedRequest.poolToken).to.equal(withdrawalRequest.poolToken);
                        expect(completedRequest.poolTokenAmount).to.equal(withdrawalRequest.poolTokenAmount);
                        expect(completedRequest.reserveTokenAmount).to.equal(withdrawalRequest.reserveTokenAmount);

                        const res = await network.completeWithdrawalT(CONTEXT_ID, provider.address, id);

                        await expect(res)
                            .to.emit(pendingWithdrawals, 'WithdrawalCompleted')
                            .withArgs(
                                CONTEXT_ID,
                                reserveToken.address,
                                provider.address,
                                id,
                                withdrawalRequest.poolTokenAmount,
                                withdrawalRequest.reserveTokenAmount,
                                (await pendingWithdrawals.currentTime()) - withdrawalRequest.createdAt
                            );

                        expect(await pendingWithdrawals.isReadyForWithdrawal(id)).to.be.false;

                        expect(await poolToken.totalSupply()).to.equal(prevTotalSupply);
                        expect(await poolToken.balanceOf(provider.address)).to.equal(prevProviderBalance);
                        expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                            prevPendingWithdrawalsBalance
                        );
                        expect(await poolToken.balanceOf(network.address)).to.equal(prevNetworkBalance);
                        expect(await pendingWithdrawals.withdrawalRequestCount(provider.address)).to.equal(
                            withdrawalRequestCount.sub(1)
                        );
                        expect(await pendingWithdrawals.withdrawalRequestIds(provider.address)).not.to.have.members([
                            id
                        ]);
                    };

                    beforeEach(async () => {
                        await poolToken.connect(provider).approve(network.address, poolTokenAmount);
                        await network.connect(provider).initWithdrawal(poolToken.address, poolTokenAmount);

                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider.address);
                        id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
                        creationTime = withdrawalRequest.createdAt;
                    });

                    it('should revert when attempting to complete a withdrawal request from a a non-network', async () => {
                        const nonNetwork = deployer;

                        await expect(
                            pendingWithdrawals.connect(nonNetwork).completeWithdrawal(CONTEXT_ID, provider.address, id)
                        ).to.be.revertedWithError('AccessDenied');
                    });

                    context('during the lock duration', () => {
                        beforeEach(async () => {
                            await pendingWithdrawals.setTime(creationTime + 1000);
                        });

                        it('should mark the request as not ready for withdrawal', async () => {
                            expect(await pendingWithdrawals.isReadyForWithdrawal(id)).to.be.false;
                        });

                        it('should revert when attempting to complete a withdrawal request', async () => {
                            await expect(
                                network.completeWithdrawalT(CONTEXT_ID, provider.address, id)
                            ).to.be.revertedWithError('WithdrawalNotAllowed');
                        });
                    });

                    context('after the lock duration', () => {
                        beforeEach(async () => {
                            await pendingWithdrawals.setTime(
                                creationTime + (await pendingWithdrawals.lockDuration()) + 1
                            );
                        });

                        it('should mark the request as ready for withdrawal', async () => {
                            expect(await pendingWithdrawals.isReadyForWithdrawal(id)).to.be.true;
                        });

                        it('should revert when attempting to cancel a completed withdrawal request', async () => {
                            await network.completeWithdrawalT(CONTEXT_ID, provider.address, id);

                            await expect(network.connect(provider).cancelWithdrawal(id)).to.be.revertedWithError(
                                'AccessDenied'
                            );
                        });

                        it('should complete a withdrawal request', async () => {
                            await testCompleteWithdrawal();
                        });

                        context('with increased pool token value', () => {
                            beforeEach(async () => {
                                const feeAmount = toWei(100_000);

                                if (tokenData.isBNT()) {
                                    await network.onBNTFeesCollectedT(reserveToken.address, feeAmount, true);
                                } else {
                                    await network.onPoolCollectionFeesCollectedT(
                                        poolCollection.address,
                                        reserveToken.address,
                                        feeAmount
                                    );
                                }
                            });

                            it('should complete a withdrawal request', async () => {
                                await testCompleteWithdrawal();
                            });
                        });
                    });
                });
            });
        };

        for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testWithdrawals(new TokenData(symbol));
            });
        }
    });
});
