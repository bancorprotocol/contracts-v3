import Contracts from '../../components/Contracts';
import {
    BancorNetworkInformation,
    IERC20,
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestMasterPool,
    TestPendingWithdrawals,
    TestPoolCollection
} from '../../typechain-types';
import { expectRole, roles } from '../helpers/AccessControl';
import { MAX_UINT256, ZERO_ADDRESS, BNT, ETH, TKN, FeeTypes } from '../helpers/Constants';
import { createSystem, setupSimplePool, depositToPool } from '../helpers/Factory';
import { permitSignature } from '../helpers/Permit';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { createWallet, TokenWithAddress } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, utils, Wallet } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles } = roles;
const { formatBytes32String } = utils;

describe('PendingWithdrawals', () => {
    const DEFAULT_LOCK_DURATION = duration.days(7).toNumber();
    const DEFAULT_WITHDRAWAL_WINDOW_DURATION = duration.days(3).toNumber();

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    shouldHaveGap('PendingWithdrawals', '_lockDuration');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let pendingWithdrawals: TestPendingWithdrawals;

        beforeEach(async () => {
            ({ network, networkToken, masterPool, pendingWithdrawals } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.PendingWithdrawals.deploy(ZERO_ADDRESS, networkToken.address, masterPool.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network token contract', async () => {
            await expect(
                Contracts.PendingWithdrawals.deploy(network.address, ZERO_ADDRESS, masterPool.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master pool contract', async () => {
            await expect(
                Contracts.PendingWithdrawals.deploy(network.address, networkToken.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(pendingWithdrawals.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await pendingWithdrawals.version()).to.equal(1);

            await expectRole(pendingWithdrawals, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);

            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
        });

        it('should emit events on initialization', async () => {
            const pendingWithdrawals = await Contracts.PendingWithdrawals.deploy(
                network.address,
                networkToken.address,
                masterPool.address
            );
            const res = await pendingWithdrawals.initialize();
            await expect(res)
                .to.emit(pendingWithdrawals, 'LockDurationUpdated')
                .withArgs(BigNumber.from(0), DEFAULT_LOCK_DURATION);
            await expect(res)
                .to.emit(pendingWithdrawals, 'WithdrawalWindowDurationUpdated')
                .withArgs(BigNumber.from(0), DEFAULT_WITHDRAWAL_WINDOW_DURATION);
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
            ).to.be.revertedWith('AccessDenied');
        });

        it('should ignore updating to the same withdrawal window duration', async () => {
            await pendingWithdrawals.setWithdrawalWindowDuration(newWithdrawalWindowDuration);

            const res = await pendingWithdrawals.setWithdrawalWindowDuration(newWithdrawalWindowDuration);
            await expect(res).not.to.emit(pendingWithdrawals, 'WithdrawalWindowDurationUpdated');
        });

        it('should be able to set and update the withdrawal window duration', async () => {
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
        let poolToken: PoolToken;
        let reserveToken: TokenWithAddress;
        let networkInformation: BancorNetworkInformation;
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let masterPoolToken: PoolToken;
        let pendingWithdrawals: TestPendingWithdrawals;
        let poolCollection: TestPoolCollection;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(100_000));

        const testWithdrawals = async (symbol: string) => {
            const isNetworkToken = symbol === BNT;

            beforeEach(async () => {
                ({
                    network,
                    networkInformation,
                    networkSettings,
                    networkToken,
                    masterPool,
                    masterPoolToken,
                    pendingWithdrawals,
                    poolCollection
                } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
                await networkSettings.setPoolMintingLimit(networkToken.address, MAX_UINT256);

                await pendingWithdrawals.setTime(await latest());
            });

            const poolTokenUnderlying = async (poolToken: PoolToken, amount: BigNumber) => {
                let stakedBalance: BigNumber;
                if (masterPoolToken.address === poolToken.address) {
                    stakedBalance = await masterPool.stakedBalance();
                } else {
                    ({ stakedBalance } = await poolCollection.poolLiquidity(reserveToken.address));
                }

                return amount.mul(stakedBalance).div(await poolToken.totalSupply());
            };

            describe('initiation', () => {
                const test = (permitted = false) => {
                    let provider: Wallet;
                    let providerAddress: string;
                    let providerNonce: BigNumber;

                    beforeEach(async () => {
                        provider = await createWallet();
                        providerAddress = await provider.getAddress();
                        providerNonce = BigNumber.from(0);
                    });

                    const initWithdrawal = async (poolToken: PoolToken, amount: BigNumber) => {
                        if (!permitted) {
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

                        return pendingWithdrawals
                            .connect(provider)
                            .initWithdrawalPermitted(poolToken.address, amount, MAX_UINT256, v, r, s);
                    };

                    const testInitWithdrawal = async (poolToken: PoolToken, amount: BigNumber) => {
                        const providerBalance = await poolToken.balanceOf(providerAddress);
                        const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                        const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(providerAddress);

                        const res = await initWithdrawal(poolToken, amount);
                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(providerAddress);
                        const id = withdrawalRequestIds[withdrawalRequestIds.length - 1];
                        const reserveTokenAmount = await poolTokenUnderlying(poolToken, amount);

                        await expect(res)
                            .to.emit(pendingWithdrawals, 'WithdrawalInitiated')
                            .withArgs(reserveToken.address, providerAddress, id, amount, reserveTokenAmount);

                        expect(await pendingWithdrawals.readyForWithdrawal(id)).to.be.false;

                        expect(await poolToken.balanceOf(providerAddress)).to.equal(providerBalance.sub(amount));
                        expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                            pendingWithdrawalsBalance.add(amount)
                        );
                        expect(await pendingWithdrawals.withdrawalRequestCount(providerAddress)).to.equal(
                            withdrawalRequestCount.add(BigNumber.from(1))
                        );

                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);
                        expect(withdrawalRequest.provider).to.equal(providerAddress);
                        expect(withdrawalRequest.poolToken).to.equal(poolToken.address);
                        expect(withdrawalRequest.reserveToken).to.equal(reserveToken.address);
                        expect(withdrawalRequest.poolTokenAmount).to.equal(amount);
                        expect(withdrawalRequest.reserveTokenAmount).to.equal(reserveTokenAmount);
                        expect(withdrawalRequest.createdAt).to.equal(await pendingWithdrawals.currentTime());
                    };

                    if (!isNetworkToken) {
                        it('should revert when attempting to withdraw from an invalid pool', async () => {
                            const poolToken = await Contracts.PoolToken.deploy(
                                'POOL',
                                'POOL',
                                18,
                                reserveToken.address
                            );
                            const amount = BigNumber.from(1);

                            if (!permitted) {
                                await expect(
                                    pendingWithdrawals.initWithdrawal(ZERO_ADDRESS, amount)
                                ).to.be.revertedWith('InvalidAddress');

                                await expect(
                                    pendingWithdrawals.initWithdrawal(poolToken.address, amount)
                                ).to.be.revertedWith('InvalidPool');
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
                                    pendingWithdrawals
                                        .connect(provider)
                                        .initWithdrawalPermitted(ZERO_ADDRESS, BigNumber.from(1), MAX_UINT256, v, r, s)
                                ).to.be.revertedWith('InvalidAddress');

                                await expect(
                                    pendingWithdrawals
                                        .connect(provider)
                                        .initWithdrawalPermitted(
                                            poolToken.address,
                                            BigNumber.from(1),
                                            MAX_UINT256,
                                            v,
                                            r,
                                            s
                                        )
                                ).to.be.revertedWith('InvalidPool');
                            }
                        });
                    }

                    context('with provided liquidity', () => {
                        let poolTokenAmount: BigNumber;

                        beforeEach(async () => {
                            ({ poolToken, token: reserveToken } = await setupSimplePool(
                                {
                                    symbol: TKN,
                                    balance: toWei(BigNumber.from(1_000_000)),
                                    initialRate: { n: BigNumber.from(1), d: BigNumber.from(2) }
                                },
                                provider as any as SignerWithAddress,
                                network,
                                networkInformation,
                                networkSettings,
                                poolCollection
                            ));

                            poolTokenAmount = await poolToken.balanceOf(provider.address);
                        });

                        it('should revert when attempting to withdraw a zero amount of pool tokens', async () => {
                            await expect(initWithdrawal(poolToken, BigNumber.from(0))).to.be.revertedWith('ZeroValue');
                        });

                        it('should revert when attempting to withdraw an invalid amount of pool tokens', async () => {
                            await expect(
                                initWithdrawal(poolToken, poolTokenAmount.add(BigNumber.from(1)))
                            ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                        });

                        it('should revert when attempting to withdraw an insufficient amount of pool tokens', async () => {
                            const providerBalance = await poolToken.balanceOf(providerAddress);
                            await expect(
                                initWithdrawal(poolToken, providerBalance.add(BigNumber.from(1)))
                            ).to.be.revertedWith('ERC20: transfer amount exceeds balance');
                        });

                        it('should init a withdraw', async () => {
                            await testInitWithdrawal(poolToken, poolTokenAmount);
                        });

                        it('should init multiple withdraws', async () => {
                            const withdrawals = 3;
                            for (let i = 0; i < withdrawals; i++) {
                                await testInitWithdrawal(
                                    poolToken,
                                    poolTokenAmount.div(BigNumber.from(withdrawals + i))
                                );
                            }
                        });
                    });
                };

                for (const permitted of [false, true]) {
                    context(permitted ? 'permitted' : 'regular', async () => {
                        test(permitted);
                    });
                }
            });

            describe('cancellation', () => {
                let provider1: SignerWithAddress;
                let poolTokenAmount: BigNumber;

                before(async () => {
                    [, provider1] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    ({ poolToken, token: reserveToken } = await setupSimplePool(
                        {
                            symbol: TKN,
                            balance: toWei(BigNumber.from(1_000_000)),
                            initialRate: { n: BigNumber.from(1), d: BigNumber.from(2) }
                        },
                        provider1,
                        network,
                        networkInformation,
                        networkSettings,
                        poolCollection
                    ));

                    poolTokenAmount = await poolToken.balanceOf(provider1.address);
                });

                it('should revert when cancelling a non-existing withdrawal request', async () => {
                    await expect(pendingWithdrawals.cancelWithdrawal(BigNumber.from(1))).to.be.revertedWith(
                        'AccessDenied'
                    );
                });

                context('with initiated withdrawal requests', () => {
                    const testCancelWithdrawal = async (provider: SignerWithAddress, id: BigNumber) => {
                        const providerBalance = await poolToken.balanceOf(provider.address);
                        const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                        const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(
                            provider.address
                        );
                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);

                        const res = await pendingWithdrawals.connect(provider).cancelWithdrawal(id);
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

                        expect(await pendingWithdrawals.readyForWithdrawal(id)).to.be.false;

                        expect(await poolToken.balanceOf(provider.address)).to.equal(
                            providerBalance.add(withdrawalRequest.poolTokenAmount)
                        );
                        expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                            pendingWithdrawalsBalance.sub(withdrawalRequest.poolTokenAmount)
                        );
                        expect(await pendingWithdrawals.withdrawalRequestCount(provider.address)).to.equal(
                            withdrawalRequestCount.sub(BigNumber.from(1))
                        );
                        expect(await pendingWithdrawals.withdrawalRequestIds(provider.address)).not.to.have.members([
                            id
                        ]);
                    };

                    let id1: BigNumber;
                    let id2: BigNumber;

                    beforeEach(async () => {
                        await poolToken.connect(provider1).approve(pendingWithdrawals.address, poolTokenAmount);

                        const withdrawalAmount1 = BigNumber.from(1111);
                        await pendingWithdrawals
                            .connect(provider1)
                            .initWithdrawal(poolToken.address, withdrawalAmount1);
                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider1.address);
                        id1 = withdrawalRequestIds[withdrawalRequestIds.length - 1];

                        const withdrawalAmount2 = poolTokenAmount.sub(withdrawalAmount1);
                        await pendingWithdrawals
                            .connect(provider1)
                            .initWithdrawal(poolToken.address, withdrawalAmount2);
                        const withdrawalRequestIds2 = await pendingWithdrawals.withdrawalRequestIds(provider1.address);
                        id2 = withdrawalRequestIds2[withdrawalRequestIds2.length - 1];
                    });

                    it("should revert when attempting to cancel another provider's request", async () => {
                        const provider2 = (await ethers.getSigners())[5];

                        await depositToPool(provider2, reserveToken, BigNumber.from(1000), network);
                        const poolTokenAmount2 = await poolToken.balanceOf(provider2.address);

                        await poolToken.connect(provider2).approve(pendingWithdrawals.address, poolTokenAmount2);
                        await pendingWithdrawals.connect(provider2).initWithdrawal(poolToken.address, poolTokenAmount2);
                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider2.address);
                        const provider2Id = withdrawalRequestIds[0];

                        await expect(
                            pendingWithdrawals.connect(provider1).cancelWithdrawal(provider2Id)
                        ).to.be.revertedWith('AccessDenied');
                    });

                    it('should revert when cancelling a withdrawal request twice', async () => {
                        await pendingWithdrawals.connect(provider1).cancelWithdrawal(id1);
                        await expect(pendingWithdrawals.connect(provider1).cancelWithdrawal(id1)).to.be.revertedWith(
                            'AccessDenied'
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
                let poolTokenAmount: BigNumber;

                before(async () => {
                    [, provider1] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    ({ poolToken, token: reserveToken } = await setupSimplePool(
                        {
                            symbol: TKN,
                            balance: toWei(BigNumber.from(1_000_000)),
                            initialRate: { n: BigNumber.from(1), d: BigNumber.from(2) }
                        },
                        provider1,
                        network,
                        networkInformation,
                        networkSettings,
                        poolCollection
                    ));

                    poolTokenAmount = await poolToken.balanceOf(provider1.address);
                });

                it('should revert when attempting to reinitiate a non-existing withdrawal request', async () => {
                    await expect(pendingWithdrawals.reinitWithdrawal(BigNumber.from(1))).to.be.revertedWith(
                        'AccessDenied'
                    );
                });

                context('with initiated withdrawal requests', () => {
                    const testReinitWithdrawal = async (provider: SignerWithAddress, id: BigNumber) => {
                        const providerBalance = await poolToken.balanceOf(provider.address);
                        const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                        const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(
                            provider.address
                        );
                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);

                        await pendingWithdrawals.setTime(withdrawalRequest.createdAt + 1);

                        const res = await pendingWithdrawals.connect(provider).reinitWithdrawal(id);
                        await expect(res)
                            .to.emit(pendingWithdrawals, 'WithdrawalReinitiated')
                            .withArgs(
                                reserveToken.address,
                                provider.address,
                                id,
                                withdrawalRequest.poolTokenAmount,
                                withdrawalRequest.reserveTokenAmount,
                                (await pendingWithdrawals.currentTime()) - withdrawalRequest.createdAt
                            );

                        expect(await pendingWithdrawals.readyForWithdrawal(id)).to.be.false;

                        expect(await poolToken.balanceOf(provider.address)).to.equal(providerBalance);
                        expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                            pendingWithdrawalsBalance
                        );
                        expect(await pendingWithdrawals.withdrawalRequestCount(provider.address)).to.equal(
                            withdrawalRequestCount
                        );

                        const withdrawalRequest2 = await pendingWithdrawals.withdrawalRequest(id);
                        expect(withdrawalRequest2.provider).to.equal(withdrawalRequest.provider);
                        expect(withdrawalRequest2.poolToken).to.equal(withdrawalRequest.poolToken);
                        expect(withdrawalRequest2.poolTokenAmount).to.equal(withdrawalRequest.poolTokenAmount);
                        expect(withdrawalRequest2.createdAt).to.gte(await pendingWithdrawals.currentTime());
                        expect(withdrawalRequest2.createdAt).not.to.equal(withdrawalRequest.createdAt);
                    };

                    let id1: BigNumber;
                    let id2: BigNumber;

                    beforeEach(async () => {
                        await poolToken.connect(provider1).approve(pendingWithdrawals.address, poolTokenAmount);

                        const withdrawalAmount1 = BigNumber.from(1111);
                        await pendingWithdrawals
                            .connect(provider1)
                            .initWithdrawal(poolToken.address, withdrawalAmount1);
                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider1.address);
                        id1 = withdrawalRequestIds[withdrawalRequestIds.length - 1];

                        const withdrawalAmount2 = poolTokenAmount.sub(withdrawalAmount1);
                        await pendingWithdrawals
                            .connect(provider1)
                            .initWithdrawal(poolToken.address, withdrawalAmount2);
                        const withdrawalRequestIds2 = await pendingWithdrawals.withdrawalRequestIds(provider1.address);
                        id2 = withdrawalRequestIds2[withdrawalRequestIds2.length - 1];
                    });

                    it("should revert when attempting to reinitiate another provider's request", async () => {
                        const provider2 = (await ethers.getSigners())[5];

                        await depositToPool(provider2, reserveToken, BigNumber.from(1000), network);
                        const poolTokenAmount2 = await poolToken.balanceOf(provider2.address);

                        await poolToken.connect(provider2).approve(pendingWithdrawals.address, poolTokenAmount2);
                        await pendingWithdrawals.connect(provider2).initWithdrawal(poolToken.address, poolTokenAmount2);
                        const withdrawalRequestIds = await pendingWithdrawals.withdrawalRequestIds(provider2.address);
                        const provider2Id = withdrawalRequestIds[0];

                        await expect(
                            pendingWithdrawals.connect(provider1).reinitWithdrawal(provider2Id)
                        ).to.be.revertedWith('AccessDenied');
                    });

                    it('should reinitiate withdrawal requests', async () => {
                        await testReinitWithdrawal(provider1, id1);
                        await testReinitWithdrawal(provider1, id2);
                    });
                });
            });

            describe('completion', () => {
                let provider: SignerWithAddress;

                let poolToken: PoolToken;
                let poolTokenAmount: BigNumber;
                const contextId = formatBytes32String('CTX');

                before(async () => {
                    [, provider] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    ({ poolToken, token: reserveToken } = await setupSimplePool(
                        {
                            symbol: TKN,
                            balance: toWei(BigNumber.from(1_000_000)),
                            initialRate: { n: BigNumber.from(1), d: BigNumber.from(2) }
                        },
                        provider,
                        network,
                        networkInformation,
                        networkSettings,
                        poolCollection
                    ));

                    poolTokenAmount = await poolToken.balanceOf(provider.address);
                });

                it('should revert when attempting to complete a non-existing withdrawal request', async () => {
                    await expect(
                        pendingWithdrawals.completeWithdrawal(contextId, provider.address, BigNumber.from(100))
                    ).to.be.revertedWith('AccessDenied');
                });

                context('with an initiated withdrawal request', () => {
                    let id: BigNumber;
                    let creationTime: number;

                    const testCompleteWithdrawal = async () => {
                        const providerBalance = await poolToken.balanceOf(provider.address);
                        const pendingWithdrawalsBalance = await poolToken.balanceOf(pendingWithdrawals.address);
                        const networkBalance = await poolToken.balanceOf(network.address);
                        const prevTotalSupply = await poolToken.totalSupply();
                        const withdrawalRequestCount = await pendingWithdrawals.withdrawalRequestCount(
                            provider.address
                        );
                        const withdrawalRequest = await pendingWithdrawals.withdrawalRequest(id);

                        const currentReserveTokenAmount = await poolTokenUnderlying(
                            poolToken,
                            withdrawalRequest.poolTokenAmount
                        );
                        const currentPoolTokenAmount = withdrawalRequest.poolTokenAmount
                            .mul(withdrawalRequest.reserveTokenAmount)
                            .div(currentReserveTokenAmount);

                        const completedRequest = await network.callStatic.completeWithdrawalT(
                            contextId,
                            provider.address,
                            id
                        );
                        expect(completedRequest.poolToken).to.equal(withdrawalRequest.poolToken);
                        expect(completedRequest.poolTokenAmount).to.equal(currentPoolTokenAmount);

                        const res = await network.completeWithdrawalT(contextId, provider.address, id);

                        await expect(res)
                            .to.emit(pendingWithdrawals, 'WithdrawalCompleted')
                            .withArgs(
                                contextId,
                                reserveToken.address,
                                provider.address,
                                id,
                                currentPoolTokenAmount,
                                currentReserveTokenAmount,
                                (await pendingWithdrawals.currentTime()) - withdrawalRequest.createdAt
                            );

                        const extraPoolTokenAmount = withdrawalRequest.poolTokenAmount.sub(currentPoolTokenAmount);
                        if (extraPoolTokenAmount.gt(BigNumber.from(0))) {
                            await expect(res)
                                .to.emit(poolToken, 'Transfer')
                                .withArgs(pendingWithdrawals.address, ZERO_ADDRESS, extraPoolTokenAmount);
                        }

                        expect(await pendingWithdrawals.readyForWithdrawal(id)).to.be.false;

                        expect(await poolToken.totalSupply()).to.equal(prevTotalSupply.sub(extraPoolTokenAmount));
                        expect(await poolToken.balanceOf(provider.address)).to.equal(providerBalance);
                        expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                            pendingWithdrawalsBalance.sub(withdrawalRequest.poolTokenAmount)
                        );
                        expect(await poolToken.balanceOf(network.address)).to.equal(
                            networkBalance.add(currentPoolTokenAmount)
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

                    it('should revert when attempting to complete a withdrawal request from a a non-network', async () => {
                        const nonNetwork = deployer;

                        await expect(
                            pendingWithdrawals.connect(nonNetwork).completeWithdrawal(contextId, provider.address, id)
                        ).to.be.revertedWith('AccessDenied');
                    });

                    context('during the lock duration', () => {
                        beforeEach(async () => {
                            await pendingWithdrawals.setTime(creationTime + 1000);
                        });

                        it('should mark the request as not ready for withdrawal', async () => {
                            expect(await pendingWithdrawals.readyForWithdrawal(id)).to.be.false;
                        });

                        it('should revert when attempting to complete a withdrawal request', async () => {
                            await expect(testCompleteWithdrawal()).to.be.revertedWith('WithdrawalNotAllowed');
                        });
                    });

                    context('after the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());

                            await pendingWithdrawals.setTime(creationTime + withdrawalDuration + 1);
                        });

                        it('should mark the request as not ready for withdrawal', async () => {
                            expect(await pendingWithdrawals.readyForWithdrawal(id)).to.be.false;
                        });

                        it('should revert when attempting to complete a withdrawal request', async () => {
                            await expect(testCompleteWithdrawal()).to.be.revertedWith('WithdrawalNotAllowed');
                        });
                    });

                    context('during the withdrawal window duration', () => {
                        beforeEach(async () => {
                            const withdrawalDuration =
                                (await pendingWithdrawals.lockDuration()) +
                                (await pendingWithdrawals.withdrawalWindowDuration());
                            await pendingWithdrawals.setTime(creationTime + withdrawalDuration - 1);
                        });

                        it('should mark the request as ready for withdrawal', async () => {
                            expect(await pendingWithdrawals.readyForWithdrawal(id)).to.be.true;
                        });

                        it('should revert when attempting to cancel a completed withdrawal request', async () => {
                            await network.completeWithdrawalT(contextId, provider.address, id);

                            await expect(pendingWithdrawals.connect(provider).cancelWithdrawal(id)).to.be.revertedWith(
                                'AccessDenied'
                            );
                        });

                        it('should complete a withdrawal request', async () => {
                            await testCompleteWithdrawal();
                        });

                        context('with increased pool token value', () => {
                            beforeEach(async () => {
                                const feeAmount = toWei(BigNumber.from(100_000));

                                if (isNetworkToken) {
                                    await network.onNetworkTokenFeesCollectedT(
                                        reserveToken.address,
                                        feeAmount,
                                        FeeTypes.Trading
                                    );
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

        for (const symbol of [BNT, ETH, TKN]) {
            context(symbol, () => {
                testWithdrawals(symbol);
            });
        }
    });
});
