import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { BigNumber, Wallet, Signer } from 'ethers';
import { ethers } from 'hardhat';
import { ZERO_ADDRESS, MAX_UINT256 } from 'test/helpers/Constants';
import { createSystem } from 'test/helpers/Factory';
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

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;
    let dummy: SignerWithAddress;

    shouldHaveGap('PendingWithdrawals', '_positions');

    before(async () => {
        [deployer, nonOwner, dummy] = await ethers.getSigners();
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

        describe('init', () => {
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

                    const res = await initWithdrawal(poolToken, amount);
                    const providerPositions = await pendingWithdrawals.positions(providerAddress);
                    await expect(res)
                        .to.emit(pendingWithdrawals, 'WithdrawalInitiated')
                        .withArgs(reserveToken.address, providerAddress, providerPositions.length - 1, amount);

                    expect(await poolToken.balanceOf(providerAddress)).to.equal(providerBalance.sub(amount));
                    expect(await poolToken.balanceOf(pendingWithdrawals.address)).to.equal(
                        pendingWithdrawalsBalance.add(amount)
                    );

                    const lastPosition = providerPositions[providerPositions.length - 1];
                    expect(lastPosition.poolToken).to.equal(poolToken.address);
                    expect(lastPosition.amount).to.equal(amount);
                    expect(lastPosition.createdAt).to.equal(await latest());
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
                        await networkSettings.addTokenToWhitelist(reserveToken.address);

                        await network.addPoolCollection(collection.address);
                        await network.createPool(await collection.poolType(), reserveToken.address);

                        poolToken = await Contracts.PoolToken.attach(await collection.poolToken(reserveToken.address));
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
    });
});
