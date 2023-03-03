import Contracts, {
    BancorNetworkInfo,
    IERC20,
    IPoolToken,
    MasterVault,
    NetworkSettings,
    TestBancorNetwork,
    TestBNTPool,
    TestPoolCollection,
    TestStandardRewards
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import {
    createStandardRewards,
    createSystem,
    createTestToken,
    depositToPool,
    setupFundedPool,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { getBalance, getTransactionCost, transfer } from '../helpers/Utils';
import { Relation } from '../matchers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish, ContractTransaction } from 'ethers';
import { ethers } from 'hardhat';
import humanizeDuration from 'humanize-duration';

describe('StandardRewards', () => {
    let deployer: SignerWithAddress;

    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let networkSettings: NetworkSettings;
    let bntGovernance: TokenGovernance;
    let bntPool: TestBNTPool;
    let bnt: IERC20;
    let vbnt: IERC20;
    let bntPoolToken: IPoolToken;
    let poolCollection: TestPoolCollection;
    let masterVault: MasterVault;

    let now: number;

    const INITIAL_BALANCE = toWei(10_000);

    shouldHaveGap('StandardRewards', '_nextProgramId');

    before(async () => {
        [deployer] = await ethers.getSigners();
    });

    beforeEach(async () => {
        now = await latest();
    });

    const prepareSimplePool = async (poolData: TokenData, initialBalance: BigNumberish) => {
        // deposit initial stake so that the participating user would have some initial amount of pool tokens
        const { token, poolToken } = await setupFundedPool(
            {
                tokenData: poolData,
                token: poolData.isBNT() ? bnt : undefined,
                balance: initialBalance,
                requestedFunding: poolData.isBNT() ? BigNumber.from(initialBalance).mul(1000) : 0,
                bntVirtualBalance: 1,
                baseTokenVirtualBalance: 2
            },
            deployer,
            network,
            networkInfo,
            networkSettings,
            poolCollection
        );

        return { token, poolToken };
    };

    const createProgram = async (
        standardRewards: TestStandardRewards,
        pool: TokenWithAddress,
        totalRewards: BigNumberish,
        startTime: number,
        endTime: number
    ) => {
        const id = await standardRewards.callStatic.createProgram(pool.address, totalRewards, startTime, endTime);

        await standardRewards.createProgram(pool.address, totalRewards, startTime, endTime);

        return id;
    };

    const setTime = async (standardRewards: TestStandardRewards, time: number) => {
        await standardRewards.setTime(time);

        now = time;
    };

    const increaseTime = async (standardRewards: TestStandardRewards, duration: number) =>
        setTime(standardRewards, now + duration);

    describe('construction', () => {
        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, vbnt, bntGovernance, bntPool, masterVault, poolCollection } =
                await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    ZERO_ADDRESS,
                    networkSettings.address,
                    bntGovernance.address,
                    vbnt.address,
                    bntPool.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    bntGovernance.address,
                    vbnt.address,
                    bntPool.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    vbnt.address,
                    bntPool.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid vBNT contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bntGovernance.address,
                    ZERO_ADDRESS,
                    bntPool.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT pool contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bntGovernance.address,
                    vbnt.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            const standardRewards = await createStandardRewards(network, networkSettings, bntGovernance, vbnt, bntPool);

            await expect(standardRewards.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const standardRewards = await createStandardRewards(network, networkSettings, bntGovernance, vbnt, bntPool);

            expect(await standardRewards.version()).to.equal(4);

            await expectRoles(standardRewards, Roles.Upgradeable);

            await expectRole(standardRewards, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('management', () => {
        let standardRewards: TestStandardRewards;

        const TOTAL_REWARDS = toWei(1000);

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, vbnt, bntGovernance, bntPool, masterVault, poolCollection } =
                await createSystem());

            standardRewards = await createStandardRewards(network, networkSettings, bntGovernance, vbnt, bntPool);

            await setTime(standardRewards, now);
        });

        describe('creation', () => {
            describe('basic tests', () => {
                let pool: TokenWithAddress;

                let nonAdmin: SignerWithAddress;

                before(async () => {
                    [, nonAdmin] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    ({ token: pool } = await prepareSimplePool(new TokenData(TokenSymbol.TKN), INITIAL_BALANCE));
                });

                it('should revert when a non-admin is attempting to create a program', async () => {
                    await expect(
                        standardRewards
                            .connect(nonAdmin)
                            .createProgram(pool.address, TOTAL_REWARDS, now, now + duration.days(1))
                    ).to.be.revertedWithError('AccessDenied');
                });

                it('should revert when attempting to create a program with for an invalid pool', async () => {
                    await expect(
                        standardRewards.createProgram(ZERO_ADDRESS, TOTAL_REWARDS, now, now + duration.days(1))
                    ).to.be.revertedWithError('InvalidAddress');

                    const token2 = await createTestToken();

                    await expect(
                        standardRewards.createProgram(token2.address, TOTAL_REWARDS, now, now + duration.days(1))
                    ).to.be.revertedWithError('NotWhitelisted');
                });

                it('should revert when attempting to create a program with an invalid total rewards amount', async () => {
                    await expect(
                        standardRewards.createProgram(pool.address, 0, now, now + duration.days(1))
                    ).to.be.revertedWithError('ZeroValue');
                });

                it('should revert when attempting to create a program with an invalid start/end time', async () => {
                    await expect(
                        standardRewards.createProgram(pool.address, TOTAL_REWARDS, now - 1, now + duration.days(1))
                    ).to.be.revertedWithError('InvalidParam');

                    await expect(
                        standardRewards.createProgram(pool.address, TOTAL_REWARDS, now + duration.days(1), now)
                    ).to.be.revertedWithError('InvalidParam');
                });
            });

            const testCreateProgram = (poolSymbol: TokenSymbol) => {
                const poolData = new TokenData(poolSymbol);
                let pool: TokenWithAddress;
                let poolToken: IPoolToken;
                let startTime: number;
                let endTime: number;

                beforeEach(async () => {
                    startTime = now;
                    endTime = now + duration.weeks(12);

                    ({ token: pool, poolToken } = await prepareSimplePool(poolData, INITIAL_BALANCE));
                });

                const testProgram = async (
                    pool: TokenWithAddress,
                    totalRewards: BigNumberish,
                    startTime: number,
                    endTime: number
                ) => {
                    const id = await standardRewards.nextProgramId();

                    expect((await standardRewards.programIds()).map((id) => id.toNumber())).not.to.include(
                        id.toNumber()
                    );
                    expect(await standardRewards.isProgramActive(id)).to.be.false;
                    expect(await standardRewards.isProgramPaused(id)).to.be.false;

                    const res = await standardRewards.createProgram(pool.address, totalRewards, startTime, endTime);

                    await expect(res)
                        .to.emit(standardRewards, 'ProgramCreated')
                        .withArgs(pool.address, id, bnt.address, totalRewards, startTime, endTime);

                    expect((await standardRewards.programIds()).map((id) => id.toNumber())).to.include(id.toNumber());
                    expect(await standardRewards.isProgramActive(id)).to.be.true;
                    expect(await standardRewards.isProgramPaused(id)).to.be.false;
                    expect(await standardRewards.latestProgramId(pool.address)).to.equal(id);

                    const [program] = await standardRewards.programs([id]);

                    expect(program.id).to.equal(id);
                    expect(program.pool).to.equal(pool.address);
                    expect(program.poolToken).to.equal(poolToken.address);
                    expect(program.rewardsToken).to.equal(bnt.address);
                    expect(program.isPaused).to.be.false;
                    expect(program.startTime).to.equal(startTime);
                    expect(program.endTime).to.equal(endTime);
                    expect(program.rewardRate).to.equal(BigNumber.from(totalRewards).div(endTime - startTime));
                    expect(program.remainingRewards).to.equal(program.rewardRate.mul(endTime - startTime));
                };

                it('should allow creating a program', async () => {
                    await testProgram(pool, TOTAL_REWARDS, now, now + duration.weeks(12));
                });

                context('with an existing active program', () => {
                    let id: BigNumber;

                    const TOTAL_REWARDS2 = toWei(1000);

                    beforeEach(async () => {
                        id = await createProgram(standardRewards, pool, TOTAL_REWARDS, startTime, endTime);
                    });

                    it('should revert', async () => {
                        await expect(
                            standardRewards.createProgram(pool.address, TOTAL_REWARDS2, startTime, endTime)
                        ).to.be.revertedWithError('AlreadyExists');
                    });

                    context('when the active program was paused', () => {
                        beforeEach(async () => {
                            await standardRewards.pauseProgram(id, true);
                        });

                        it('should revert', async () => {
                            await expect(
                                standardRewards.createProgram(pool.address, TOTAL_REWARDS2, startTime, endTime)
                            ).to.be.revertedWithError('AlreadyExists');
                        });
                    });

                    context('after the active program has ended', () => {
                        beforeEach(async () => {
                            await setTime(standardRewards, endTime + 1);
                        });

                        context('with available rewards', () => {
                            it('should allow creating a program', async () => {
                                await testProgram(pool, TOTAL_REWARDS2, now, now + duration.weeks(12));
                            });
                        });
                    });

                    context('when the active program was terminated', () => {
                        beforeEach(async () => {
                            await standardRewards.terminateProgram(id);
                        });

                        context('with available rewards', () => {
                            it('should allow creating a program', async () => {
                                await testProgram(pool, TOTAL_REWARDS2, now, now + duration.weeks(12));
                            });
                        });
                    });
                });
            };

            for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                context(poolSymbol, () => {
                    testCreateProgram(poolSymbol);
                });
            }
        });

        describe('termination', () => {
            let pool: TokenWithAddress;
            let poolToken: IPoolToken;
            let poolTokenAmount: BigNumber;

            let nonAdmin: SignerWithAddress;
            let provider: SignerWithAddress;

            const DEPOSIT_AMOUNT = toWei(10_000);

            before(async () => {
                [, provider, nonAdmin] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ token: pool, poolToken } = await prepareSimplePool(new TokenData(TokenSymbol.TKN), INITIAL_BALANCE));

                await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);
                await depositToPool(provider, pool, DEPOSIT_AMOUNT, network);
                poolTokenAmount = await poolToken.balanceOf(provider.address);
            });

            it('should revert when a non-admin is attempting to terminate a program', async () => {
                await expect(standardRewards.connect(nonAdmin).terminateProgram(1)).to.be.revertedWithError(
                    'AccessDenied'
                );
            });

            it('should revert when attempting to terminate a non-existing program', async () => {
                await expect(standardRewards.terminateProgram(1)).to.be.revertedWithError('DoesNotExist');
            });

            context('with an active program', () => {
                let startTime: number;
                let endTime: number;
                let rewardRate: BigNumber;

                let id: BigNumber;

                before(async () => {
                    [, provider] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    startTime = now;
                    endTime = now + duration.weeks(12);
                    rewardRate = TOTAL_REWARDS.div(endTime - startTime);

                    id = await createProgram(standardRewards, pool, TOTAL_REWARDS, startTime, endTime);

                    await poolToken.connect(provider).approve(standardRewards.address, poolTokenAmount);
                    await standardRewards.connect(provider).join(id, poolTokenAmount);

                    await increaseTime(standardRewards, duration.seconds(1));
                });

                const testTerminate = async () => {
                    const prevRewards = await standardRewards.pendingRewards(provider.address, [id]);
                    const [prevProgram] = await standardRewards.programs([id]);

                    const res = await standardRewards.terminateProgram(id);

                    const remainingRewards = now >= endTime ? 0 : rewardRate.mul(endTime - now);
                    await expect(res).to.emit(standardRewards, 'ProgramTerminated').withArgs(pool.address, id, endTime);

                    expect(await standardRewards.isProgramActive(id)).to.be.false;

                    const [program] = await standardRewards.programs([id]);
                    expect(program.startTime).to.equal(prevProgram.startTime);
                    expect(program.remainingRewards).to.equal(prevProgram.remainingRewards.sub(remainingRewards));
                    expect(program.endTime).not.to.equal(prevProgram.endTime);
                    expect(program.endTime).to.equal(await standardRewards.currentTime());

                    // ensure that pending rewards aren't being accrued for terminated programs
                    await increaseTime(standardRewards, duration.days(1));
                    expect(await standardRewards.pendingRewards(provider.address, [id])).to.equal(prevRewards);
                };

                it('should allow terminating the program', async () => {
                    await testTerminate();
                });

                context('when rewards were distributed', () => {
                    beforeEach(async () => {
                        await increaseTime(standardRewards, duration.days(3));
                    });

                    it('should allow terminating the program', async () => {
                        await testTerminate();
                    });
                });

                context('when the active program was paused', () => {
                    beforeEach(async () => {
                        await standardRewards.pauseProgram(id, true);
                    });

                    it('should allow terminating the program', async () => {
                        await testTerminate();
                    });
                });

                context('after the active program has ended', () => {
                    beforeEach(async () => {
                        await setTime(standardRewards, endTime + 1);
                    });

                    it('should revert', async () => {
                        await expect(standardRewards.terminateProgram(id)).to.be.revertedWithError('ProgramInactive');
                    });
                });

                context('when the active program was terminated', () => {
                    beforeEach(async () => {
                        await standardRewards.terminateProgram(id);
                    });

                    it('should revert', async () => {
                        await expect(standardRewards.terminateProgram(id)).to.be.revertedWithError('ProgramInactive');
                    });
                });
            });
        });

        describe('paused/resuming', () => {
            let pool: TokenWithAddress;

            let nonAdmin: SignerWithAddress;

            before(async () => {
                [, nonAdmin] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ token: pool } = await prepareSimplePool(new TokenData(TokenSymbol.TKN), INITIAL_BALANCE));
            });

            it('should revert when a non-admin is attempting to pause/resume a program', async () => {
                for (const pause of [true, false]) {
                    await expect(standardRewards.connect(nonAdmin).pauseProgram(1, pause)).to.be.revertedWithError(
                        'AccessDenied'
                    );
                }
            });

            it('should revert when attempting to pause/resume a non-existing program', async () => {
                for (const pause of [true, false]) {
                    await expect(standardRewards.pauseProgram(1, pause)).to.be.revertedWithError('DoesNotExist');
                }
            });

            context('with an active program', () => {
                let startTime: number;
                let endTime: number;

                let id: BigNumber;

                beforeEach(async () => {
                    startTime = now;
                    endTime = now + duration.weeks(12);

                    id = await createProgram(standardRewards, pool, TOTAL_REWARDS, startTime, endTime);
                });

                const testPause = async () => {
                    expect(await standardRewards.isProgramPaused(id)).to.be.false;

                    const res = await standardRewards.pauseProgram(id, true);

                    await expect(res).to.emit(standardRewards, 'ProgramPaused').withArgs(pool.address, id, true);

                    expect(await standardRewards.isProgramPaused(id)).to.be.true;

                    const res2 = await standardRewards.pauseProgram(id, false);

                    await expect(res2).to.emit(standardRewards, 'ProgramPaused').withArgs(pool.address, id, false);

                    expect(await standardRewards.isProgramPaused(id)).to.be.false;
                };

                it('should allow pausing/resuming the program', async () => {
                    await testPause();
                });

                it('should ignore setting to the same status', async () => {
                    expect(await standardRewards.isProgramPaused(id)).to.be.false;
                    const res = await standardRewards.pauseProgram(id, false);
                    await expect(res).not.to.emit(standardRewards, 'ProgramPaused');

                    await standardRewards.pauseProgram(id, true);

                    expect(await standardRewards.isProgramPaused(id)).to.be.true;
                    const res2 = await standardRewards.pauseProgram(id, true);
                    await expect(res2).not.to.emit(standardRewards, 'ProgramPaused');
                });

                context('after the active program has ended', () => {
                    beforeEach(async () => {
                        await setTime(standardRewards, endTime + 1);
                    });

                    it('should allow pausing/resuming the program', async () => {
                        await testPause();
                    });
                });

                context('when the active program was terminated', () => {
                    beforeEach(async () => {
                        await standardRewards.terminateProgram(id);
                    });

                    it('should allow pausing/resuming the program', async () => {
                        await testPause();
                    });
                });
            });
        });
    });

    describe('joining/leaving', () => {
        let standardRewards: TestStandardRewards;
        let provider: SignerWithAddress;

        const DEPOSIT_AMOUNT = toWei(1000);
        const TOTAL_REWARDS = toWei(10_000);

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, vbnt, bntGovernance, bntPool, masterVault, poolCollection } =
                await createSystem());

            standardRewards = await createStandardRewards(network, networkSettings, bntGovernance, vbnt, bntPool);

            await setTime(standardRewards, now);
        });

        describe('joining', () => {
            describe('basic tests', () => {
                let pool: TokenWithAddress;
                let poolToken: IPoolToken;
                let poolTokenAmount: BigNumber;
                let id: BigNumber;

                beforeEach(async () => {
                    const tokenData = new TokenData(TokenSymbol.TKN);

                    ({ token: pool, poolToken } = await prepareSimplePool(tokenData, INITIAL_BALANCE));

                    await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);
                    await depositToPool(provider, pool, DEPOSIT_AMOUNT, network);
                    poolTokenAmount = await poolToken.balanceOf(provider.address);

                    id = await createProgram(standardRewards, pool, TOTAL_REWARDS, now, now + duration.weeks(12));
                });

                const join = async (id: BigNumberish, amount: BigNumberish) => {
                    await poolToken.connect(provider).approve(standardRewards.address, amount);

                    return standardRewards.connect(provider).join(id, amount);
                };

                it('should revert when attempting to join a non-existing program', async () => {
                    await expect(join(0, 1)).to.be.revertedWithError('DoesNotExist');
                });

                it('should revert when attempting to join with an invalid amount', async () => {
                    await expect(join(1, 0)).to.be.revertedWithError('ZeroValue');
                });

                it('should join an existing program', async () => {
                    const providerProgramIds = (await standardRewards.providerProgramIds(provider.address)).map((id) =>
                        id.toNumber()
                    );

                    expect(providerProgramIds).not.to.include(id.toNumber());

                    await join(id, poolTokenAmount);

                    expect(
                        (await standardRewards.providerProgramIds(provider.address)).map((id) => id.toNumber())
                    ).to.include(id.toNumber());
                });

                context('without approving the pool token', () => {
                    it('should revert', async () => {
                        await expect(
                            standardRewards.connect(provider).join(id, poolTokenAmount)
                        ).to.be.revertedWithError(new TokenData(TokenSymbol.bnBNT).errors().exceedsAllowance);
                    });
                });
            });

            const testJoin = (poolSymbol: TokenSymbol) => {
                const poolData = new TokenData(poolSymbol);
                let pool: TokenWithAddress;
                let poolToken: IPoolToken;
                let poolTokenAmount: BigNumber;

                beforeEach(async () => {
                    ({ token: pool, poolToken } = await prepareSimplePool(poolData, INITIAL_BALANCE));

                    await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);
                    await depositToPool(provider, pool, DEPOSIT_AMOUNT, network);
                    poolTokenAmount = await poolToken.balanceOf(provider.address);
                });

                context('with an active program', () => {
                    let startTime: number;
                    let endTime: number;

                    let id: BigNumber;

                    beforeEach(async () => {
                        startTime = now;
                        endTime = now + duration.weeks(12);

                        id = await createProgram(standardRewards, pool, TOTAL_REWARDS, startTime, endTime);
                    });

                    context('with pool token approval', () => {
                        beforeEach(async () => {
                            await poolToken.connect(provider).approve(standardRewards.address, poolTokenAmount);
                        });

                        const testJoinProgram = async (id: BigNumber, amount: BigNumberish) => {
                            const expectedUpdateTime = Math.min(now, endTime);

                            const prevProgramRewards = await standardRewards.programRewards(id);
                            expect(prevProgramRewards.lastUpdateTime).not.to.equal(expectedUpdateTime);

                            const prevProviderRewards = await standardRewards.providerRewards(provider.address, id);
                            const prevProgramStake = await standardRewards.programStake(id);
                            const prevProviderStake = await standardRewards.providerStake(provider.address, id);
                            const prevProviderTokenBalance = await poolToken.balanceOf(provider.address);
                            const prevProviderRewardsTokenBalance = await getBalance(bnt, provider);
                            const prevStandardRewardsBalance = await poolToken.balanceOf(standardRewards.address);
                            const prevRewardsTokenBalance = await getBalance(bnt, standardRewards);

                            const providerProgramIds = (await standardRewards.providerProgramIds(provider.address)).map(
                                (id) => id.toNumber()
                            );

                            if (prevProgramStake.isZero()) {
                                expect(providerProgramIds).not.to.include(id.toNumber());
                            } else {
                                expect(providerProgramIds).to.include(id.toNumber());
                            }

                            const res = await standardRewards.connect(provider).join(id, amount);
                            await expect(res)
                                .to.emit(standardRewards, 'ProviderJoined')
                                .withArgs(pool.address, id, provider.address, amount, prevProviderRewards.stakedAmount);

                            expect(
                                (await standardRewards.providerProgramIds(provider.address)).map((id) => id.toNumber())
                            ).to.include(id.toNumber());

                            const programRewards = await standardRewards.programRewards(id);

                            // ensure that the snapshot has been updated
                            expect(programRewards.lastUpdateTime).to.equal(expectedUpdateTime);

                            // ensure that the stake amounts have been updated
                            expect(await standardRewards.programStake(id)).to.equal(prevProgramStake.add(amount));
                            expect(await standardRewards.providerStake(provider.address, id)).to.equal(
                                prevProviderStake.add(amount)
                            );

                            const providerRewards = await standardRewards.providerRewards(provider.address, id);
                            expect(providerRewards.rewardPerTokenPaid).to.equal(programRewards.rewardPerToken);
                            expect(providerRewards.stakedAmount).to.equal(prevProviderRewards.stakedAmount.add(amount));

                            expect(await poolToken.balanceOf(provider.address)).to.equal(
                                prevProviderTokenBalance.sub(amount)
                            );
                            expect(await getBalance(bnt, provider)).to.equal(prevProviderRewardsTokenBalance);
                            expect(await poolToken.balanceOf(standardRewards.address)).to.equal(
                                prevStandardRewardsBalance.add(amount)
                            );
                            expect(await getBalance(bnt, standardRewards)).to.equal(prevRewardsTokenBalance);
                        };

                        it('should join', async () => {
                            await testJoinProgram(id, poolTokenAmount);
                        });

                        it('should join the same program multiple times', async () => {
                            const count = 3;
                            for (let i = 0; i < count; i++) {
                                await testJoinProgram(id, poolTokenAmount.div(count));

                                await increaseTime(standardRewards, duration.days(1));
                            }
                        });

                        context('when the active program was paused', () => {
                            beforeEach(async () => {
                                await standardRewards.pauseProgram(id, true);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWithError('ProgramSuspended');
                            });
                        });

                        context('after the active program has ended', () => {
                            beforeEach(async () => {
                                await setTime(standardRewards, endTime + 1);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWithError('ProgramInactive');
                            });
                        });

                        context('when the active program was terminated', () => {
                            beforeEach(async () => {
                                await standardRewards.terminateProgram(id);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWithError('ProgramInactive');
                            });
                        });
                    });
                });
            };

            for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                context(poolSymbol, () => {
                    testJoin(poolSymbol);
                });
            }
        });

        describe('leaving', () => {
            describe('basic tests', () => {
                beforeEach(async () => {
                    await prepareSimplePool(new TokenData(TokenSymbol.TKN), INITIAL_BALANCE);
                });

                it('should revert when attempting to leave a non-existing program', async () => {
                    await expect(standardRewards.connect(provider).leave(0, 1)).to.be.revertedWithError('DoesNotExist');
                });

                it('should revert when attempting to leave with an invalid amount', async () => {
                    await expect(standardRewards.connect(provider).leave(1, 0)).to.be.revertedWithError('ZeroValue');
                });
            });

            const testLeave = (poolSymbol: TokenSymbol) => {
                const poolData = new TokenData(poolSymbol);

                let pool: TokenWithAddress;
                let poolToken: IPoolToken;
                let poolTokenAmount: BigNumber;

                beforeEach(async () => {
                    ({ token: pool, poolToken } = await prepareSimplePool(poolData, INITIAL_BALANCE));

                    await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);
                    await depositToPool(provider, pool, DEPOSIT_AMOUNT, network);
                    poolTokenAmount = await poolToken.balanceOf(provider.address);
                });

                context('with an active program', () => {
                    let startTime: number;
                    let endTime: number;

                    let id: BigNumber;

                    beforeEach(async () => {
                        startTime = now;
                        endTime = now + duration.weeks(12);

                        id = await createProgram(standardRewards, pool, TOTAL_REWARDS, startTime, endTime);

                        await poolToken.connect(provider).approve(standardRewards.address, poolTokenAmount);
                        await standardRewards.connect(provider).join(id, poolTokenAmount);

                        await increaseTime(standardRewards, duration.seconds(1));
                    });

                    const testLeaveProgram = async (id: BigNumber, amount: BigNumberish) => {
                        const expectedUpdateTime = Math.min(now, endTime);

                        expect(
                            (await standardRewards.providerProgramIds(provider.address)).map((id) => id.toNumber())
                        ).to.include(id.toNumber());

                        const prevProgramStake = await standardRewards.programStake(id);
                        const prevProviderStake = await standardRewards.providerStake(provider.address, id);
                        const prevProviderRewards = await standardRewards.providerRewards(provider.address, id);
                        const prevProviderTokenBalance = await poolToken.balanceOf(provider.address);
                        const prevProviderRewardsTokenBalance = await getBalance(bnt, provider);
                        const prevStandardRewardsBalance = await poolToken.balanceOf(standardRewards.address);
                        const prevRewardsTokenBalance = await getBalance(bnt, standardRewards);

                        const res = await standardRewards.connect(provider).leave(id, amount);
                        await expect(res)
                            .to.emit(standardRewards, 'ProviderLeft')
                            .withArgs(
                                pool.address,
                                id,
                                provider.address,
                                amount,
                                prevProviderRewards.stakedAmount.sub(amount)
                            );

                        const programRewards = await standardRewards.programRewards(id);
                        const providerRewards = await standardRewards.providerRewards(provider.address, id);

                        // ensure that the program has been removed from provider's programs if the provider has removed
                        // all of its stake and there are no pending rewards
                        const pendingRewards = await standardRewards.pendingRewards(provider.address, [id]);
                        const providerProgramIds = (await standardRewards.providerProgramIds(provider.address)).map(
                            (id) => id.toNumber()
                        );

                        if (providerRewards.stakedAmount.isZero() && pendingRewards.isZero()) {
                            expect(providerProgramIds).to.not.include(id.toNumber());
                        } else {
                            expect(providerProgramIds).to.include(id.toNumber());
                        }

                        // ensure that the snapshot has been updated
                        expect(programRewards.lastUpdateTime).to.equal(expectedUpdateTime);

                        // ensure that the stake amounts have been updated
                        expect(await standardRewards.programStake(id)).to.equal(prevProgramStake.sub(amount));
                        expect(await standardRewards.providerStake(provider.address, id)).to.equal(
                            prevProviderStake.sub(amount)
                        );
                        expect(providerRewards.stakedAmount).to.equal(prevProviderRewards.stakedAmount.sub(amount));

                        expect(await poolToken.balanceOf(provider.address)).to.equal(
                            prevProviderTokenBalance.add(amount)
                        );
                        expect(await getBalance(bnt, provider)).to.equal(prevProviderRewardsTokenBalance);
                        expect(await poolToken.balanceOf(standardRewards.address)).to.equal(
                            prevStandardRewardsBalance.sub(amount)
                        );
                        expect(await getBalance(bnt, standardRewards)).to.equal(prevRewardsTokenBalance);
                    };

                    it('should leave', async () => {
                        await testLeaveProgram(id, poolTokenAmount);
                    });

                    it('should leave the same program multiple times', async () => {
                        const count = 3;
                        for (let i = 0; i < count; i++) {
                            await testLeaveProgram(id, poolTokenAmount.div(count));

                            await increaseTime(standardRewards, duration.days(1));
                        }
                    });

                    context('when no pending rewards', () => {
                        beforeEach(async () => {
                            await increaseTime(standardRewards, duration.days(1));

                            await standardRewards.connect(provider).claimRewards([id]);
                        });

                        it('should leave', async () => {
                            await testLeaveProgram(id, poolTokenAmount);
                        });
                    });

                    context('when the active program was paused', () => {
                        beforeEach(async () => {
                            await standardRewards.pauseProgram(id, true);
                        });

                        it('should leave', async () => {
                            await testLeaveProgram(id, poolTokenAmount);
                        });
                    });

                    context('after the active program has ended', () => {
                        beforeEach(async () => {
                            await setTime(standardRewards, endTime + 1);
                        });

                        it('should leave', async () => {
                            await testLeaveProgram(id, poolTokenAmount);
                        });
                    });

                    context('when the active program was terminated', () => {
                        beforeEach(async () => {
                            await standardRewards.terminateProgram(id);
                        });

                        it('should leave', async () => {
                            await testLeaveProgram(id, poolTokenAmount);
                        });
                    });
                });
            };

            for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                context(poolSymbol, () => {
                    testLeave(poolSymbol);
                });
            }
        });

        describe('depositing and joining', () => {
            describe('basic tests', () => {
                let pool: TokenWithAddress;
                let nativePool: TokenWithAddress;
                let tokenAmount: BigNumber;

                let id: BigNumber;
                let nativeId: BigNumber;

                beforeEach(async () => {
                    const startTime = now;
                    const endTime = now + duration.weeks(12);

                    ({ token: pool } = await prepareSimplePool(new TokenData(TokenSymbol.TKN), INITIAL_BALANCE));

                    tokenAmount = DEPOSIT_AMOUNT.div(2);
                    await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);

                    id = await createProgram(standardRewards, pool, TOTAL_REWARDS, startTime, endTime);

                    ({ token: nativePool } = await prepareSimplePool(new TokenData(TokenSymbol.ETH), INITIAL_BALANCE));

                    nativeId = await createProgram(standardRewards, nativePool, TOTAL_REWARDS, startTime, endTime);
                });

                interface Overrides {
                    value?: BigNumber;
                }

                const depositAndJoin = async (id: BigNumberish, amount: BigNumberish, overrides: Overrides = {}) => {
                    let { value } = overrides;

                    const [program] = await standardRewards.programs([id]);

                    if (program.pool === nativePool.address) {
                        value ||= BigNumber.from(amount);
                    } else {
                        const token = await Contracts.TestERC20Token.attach(pool.address);
                        await token.connect(provider).approve(standardRewards.address, amount);
                    }

                    return standardRewards.connect(provider).depositAndJoin(id, amount, { value });
                };

                it('should revert when attempting to deposit and join a non-existing program', async () => {
                    await expect(depositAndJoin(0, 1)).to.be.revertedWithError('DoesNotExist');
                });

                it('should revert when attempting to deposit and join with an invalid amount', async () => {
                    await expect(depositAndJoin(1, 0)).to.be.revertedWithError('ZeroValue');
                });

                it('should deposit and join an existing program', async () => {
                    const providerProgramIds = (await standardRewards.providerProgramIds(provider.address)).map((id) =>
                        id.toNumber()
                    );

                    expect(providerProgramIds).not.to.include(id.toNumber());

                    await depositAndJoin(id, tokenAmount);

                    expect(
                        (await standardRewards.providerProgramIds(provider.address)).map((id) => id.toNumber())
                    ).to.include(id.toNumber());
                });

                context('native token pool', () => {
                    it('should revert when attempting to deposit and join with more than what was actually sent', async () => {
                        const amount = toWei(1);
                        const missingAmount = 1;

                        await expect(
                            depositAndJoin(nativeId, amount, {
                                value: amount.sub(missingAmount)
                            })
                        ).to.be.revertedWithError('NativeTokenAmountMismatch');

                        await expect(
                            depositAndJoin(nativeId, amount, { value: BigNumber.from(0) })
                        ).to.be.revertedWithError('NativeTokenAmountMismatch');
                    });

                    it('should refund when attempting to deposit and join with less than what was actually sent', async () => {
                        const amount = toWei(1);
                        const extraAmount = 100_000;

                        const prevProviderBalance = await ethers.provider.getBalance(provider.address);

                        const res = await depositAndJoin(nativeId, amount, {
                            value: amount.add(extraAmount)
                        });

                        const transactionCost = await getTransactionCost(res);

                        expect(await ethers.provider.getBalance(provider.address)).equal(
                            prevProviderBalance.sub(amount).sub(transactionCost)
                        );
                    });
                });

                context('token pool', () => {
                    context('without approving the token', () => {
                        it('should revert', async () => {
                            await expect(
                                standardRewards.connect(provider).depositAndJoin(id, tokenAmount)
                            ).to.be.revertedWithError(new TokenData(TokenSymbol.TKN).errors().exceedsAllowance);
                        });
                    });

                    it('should revert when attempting to deposit and join with the native token into a non native token pool', async () => {
                        const amount = toWei(1);

                        await expect(depositAndJoin(id, amount, { value: BigNumber.from(1) })).to.be.revertedWithError(
                            'NativeTokenAmountMismatch'
                        );
                    });
                });
            });

            const testDepositAndJoin = (poolSymbol: TokenSymbol) => {
                const poolData = new TokenData(poolSymbol);
                let pool: TokenWithAddress;
                let poolToken: IPoolToken;
                let tokenAmount: BigNumber;

                beforeEach(async () => {
                    ({ token: pool, poolToken } = await prepareSimplePool(poolData, INITIAL_BALANCE));

                    tokenAmount = DEPOSIT_AMOUNT.div(2);
                    await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);
                });

                context('with an active program', () => {
                    let startTime: number;
                    let endTime: number;

                    let id: BigNumber;

                    beforeEach(async () => {
                        startTime = now;
                        endTime = now + duration.weeks(12);

                        id = await createProgram(standardRewards, pool, TOTAL_REWARDS, startTime, endTime);
                    });

                    context('with token approval', () => {
                        if (!poolData.isNative()) {
                            beforeEach(async () => {
                                const token = await Contracts.TestERC20Token.attach(pool.address);

                                await token.connect(provider).approve(standardRewards.address, tokenAmount);
                            });
                        }

                        const testDepositAndJoinProgram = async (id: BigNumber, amount: BigNumberish) => {
                            const expectedUpdateTime = Math.min(now, endTime);

                            const prevProgramRewards = await standardRewards.programRewards(id);
                            expect(prevProgramRewards.lastUpdateTime).not.to.equal(expectedUpdateTime);

                            const prevProviderRewards = await standardRewards.providerRewards(provider.address, id);
                            const prevProgramStake = await standardRewards.programStake(id);
                            const prevProviderStake = await standardRewards.providerStake(provider.address, id);
                            const prevProviderTokenBalance = await getBalance(pool, provider);
                            const prevProviderVBNTBalance = await vbnt.balanceOf(provider.address);
                            const prevProviderRewardsTokenBalance = await getBalance(bnt, provider.address);
                            const prevStandardRewardsBalance = await poolToken.balanceOf(standardRewards.address);
                            const prevRewardsTokenBalance = await getBalance(bnt, standardRewards.address);

                            const providerProgramIds = (await standardRewards.providerProgramIds(provider.address)).map(
                                (id) => id.toNumber()
                            );

                            if (prevProgramStake.isZero()) {
                                expect(providerProgramIds).not.to.include(id.toNumber());
                            } else {
                                expect(providerProgramIds).to.include(id.toNumber());
                            }

                            let expectedPoolTokenAmount;
                            if (poolData.isBNT()) {
                                expectedPoolTokenAmount = BigNumber.from(amount)
                                    .mul(await poolToken.totalSupply())
                                    .div(await bntPool.stakedBalance());
                            } else {
                                const totalSupply = await poolToken.totalSupply();
                                if (totalSupply.isZero()) {
                                    expectedPoolTokenAmount = amount;
                                } else {
                                    const { stakedBalance } = await poolCollection.poolLiquidity(pool.address);
                                    expectedPoolTokenAmount = BigNumber.from(amount)
                                        .mul(totalSupply)
                                        .div(stakedBalance);
                                }
                            }

                            let value = BigNumber.from(0);
                            if (poolData.isNative()) {
                                value = BigNumber.from(amount);
                            }

                            const res = await standardRewards.connect(provider).depositAndJoin(id, amount, { value });

                            let transactionCost = BigNumber.from(0);
                            if (poolData.isNative()) {
                                transactionCost = await getTransactionCost(res);
                            }

                            await expect(res)
                                .to.emit(standardRewards, 'ProviderJoined')
                                .withArgs(
                                    pool.address,
                                    id,
                                    provider.address,
                                    expectedPoolTokenAmount,
                                    prevProviderRewards.stakedAmount
                                );

                            expect(
                                (await standardRewards.providerProgramIds(provider.address)).map((id) => id.toNumber())
                            ).to.include(id.toNumber());

                            const programRewards = await standardRewards.programRewards(id);
                            const providerRewards = await standardRewards.providerRewards(provider.address, id);

                            // ensure that the snapshot has been updated
                            expect(programRewards.lastUpdateTime).to.equal(expectedUpdateTime);

                            // ensure that the stake amounts have been updated
                            expect(await standardRewards.programStake(id)).to.equal(prevProgramStake.add(amount));
                            expect(await standardRewards.providerStake(provider.address, id)).to.equal(
                                prevProviderStake.add(amount)
                            );

                            expect(providerRewards.rewardPerTokenPaid).to.equal(programRewards.rewardPerToken);
                            expect(providerRewards.stakedAmount).to.equal(prevProviderRewards.stakedAmount.add(amount));
                            expect(await getBalance(pool, provider.address)).to.equal(
                                prevProviderTokenBalance.sub(amount).sub(poolData.isNative() ? transactionCost : 0)
                            );
                            expect(await vbnt.balanceOf(provider.address)).to.equal(
                                poolData.isBNT()
                                    ? prevProviderVBNTBalance.add(expectedPoolTokenAmount)
                                    : prevProviderVBNTBalance
                            );
                            expect(await getBalance(bnt, provider.address)).to.equal(
                                prevProviderRewardsTokenBalance.sub(pool.address === bnt.address ? amount : 0)
                            );
                            expect(await poolToken.balanceOf(standardRewards.address)).to.equal(
                                prevStandardRewardsBalance.add(expectedPoolTokenAmount)
                            );
                            expect(await getBalance(bnt, standardRewards.address)).to.equal(prevRewardsTokenBalance);
                        };

                        it('should deposit and join', async () => {
                            await testDepositAndJoinProgram(id, tokenAmount);
                        });

                        it('should deposit and join the same program multiple times', async () => {
                            const count = 3;
                            for (let i = 0; i < count; i++) {
                                await testDepositAndJoinProgram(id, tokenAmount.div(count));

                                await increaseTime(standardRewards, duration.days(1));
                            }
                        });

                        context('when the active program was paused', () => {
                            beforeEach(async () => {
                                await standardRewards.pauseProgram(id, true);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).depositAndJoin(id, tokenAmount)
                                ).to.be.revertedWithError('ProgramSuspended');
                            });
                        });

                        context('after the active program has ended', () => {
                            beforeEach(async () => {
                                await setTime(standardRewards, endTime + 1);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).depositAndJoin(id, tokenAmount)
                                ).to.be.revertedWithError('ProgramInactive');
                            });
                        });

                        context('when the active program was terminated', () => {
                            beforeEach(async () => {
                                await standardRewards.terminateProgram(id);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).depositAndJoin(id, tokenAmount)
                                ).to.be.revertedWithError('ProgramInactive');
                            });
                        });
                    });
                });
            };

            for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                context(poolSymbol, () => {
                    testDepositAndJoin(poolSymbol);
                });
            }
        });
    });

    describe('rewards', () => {
        let standardRewards: TestStandardRewards;

        let providers: SignerWithAddress[];

        before(async () => {
            const [, provider, provider2] = await ethers.getSigners();

            providers = [provider, provider2];
        });

        beforeEach(async () => {
            ({
                network,
                networkInfo,
                networkSettings,
                bnt,
                vbnt,
                bntGovernance,
                bntPool,
                bntPoolToken,
                masterVault,
                poolCollection
            } = await createSystem());

            standardRewards = await createStandardRewards(network, networkSettings, bntGovernance, vbnt, bntPool);

            await setTime(standardRewards, now);
        });

        interface ProgramSpec {
            poolSymbol: TokenSymbol;
            initialBalance: BigNumberish;
            providerStakes: BigNumberish[];
        }

        interface ProgramData {
            id: number;
            poolData: TokenData;
            pool: TokenWithAddress;
            poolToken: IPoolToken;
            providerPoolTokenAmounts: Record<string, BigNumber>;
        }

        interface RewardsSpec {
            totalRewards: BigNumberish;
            duration: number;
        }

        interface ProgramRewardsData {
            totalStake: BigNumber;
            stakes: Record<string, BigNumber>;
            pendingRewards: Record<string, BigNumber>;
            claimedRewards: Record<string, BigNumber>;
        }

        interface RewardsData {
            startTime: number;
            endTime: number;
            totalRewards: BigNumberish;
            rewardRate: BigNumber;
            programRewardsData: Record<number, ProgramRewardsData>;
        }

        interface RewardsPoolData {
            poolData: TokenData;
            pool: TokenWithAddress;
            poolToken: IPoolToken;
        }

        const setupRewardsData = async (rewardsSpec: RewardsSpec) => {
            const startTime = now;
            const endTime = startTime + rewardsSpec.duration;

            return {
                startTime,
                endTime,
                rewardRate: BigNumber.from(rewardsSpec.totalRewards).div(endTime - startTime),
                totalRewards: rewardsSpec.totalRewards,
                programRewardsData: {
                    totalStake: BigNumber.from(0),
                    providerStakes: {},
                    providerPendingRewards: {}
                }
            };
        };

        const setupProgram = async (programSpec: ProgramSpec, rewardsData: RewardsData) => {
            const poolData = new TokenData(programSpec.poolSymbol);

            const { token: pool, poolToken } = await prepareSimplePool(poolData, programSpec.initialBalance);

            const id = await createProgram(
                standardRewards,
                pool,
                rewardsData.totalRewards,
                rewardsData.startTime,
                rewardsData.endTime
            );

            const providerPoolTokenAmounts: Record<string, BigNumber> = {};

            for (const [i, p] of providers.entries()) {
                await transfer(deployer, pool, p, programSpec.providerStakes[i]);
                await depositToPool(p, pool, programSpec.providerStakes[i], network);
                providerPoolTokenAmounts[p.address] = await poolToken.balanceOf(p.address);
            }

            return {
                id: id.toNumber(),
                poolData,
                pool,
                poolToken,
                providerPoolTokenAmounts
            };
        };

        describe('claiming/staking', () => {
            const testBasicClaiming = (programSpec: ProgramSpec, rewardsSpec: RewardsSpec) => {
                describe('basic tests', () => {
                    let rewardsData: RewardsData;
                    let programData: ProgramData;

                    let provider: SignerWithAddress;

                    before(async () => {
                        [, provider] = await ethers.getSigners();
                    });

                    beforeEach(async () => {
                        rewardsData = await setupRewardsData(rewardsSpec);
                        programData = await setupProgram(programSpec, rewardsData);
                    });

                    it('should revert when attempting to claim rewards for non-existing programs', async () => {
                        await expect(standardRewards.connect(provider).claimRewards([10_000])).to.be.revertedWithError(
                            'DoesNotExist'
                        );

                        await expect(
                            standardRewards.connect(provider).claimRewards([programData.id, 10_000])
                        ).to.be.revertedWithError('DoesNotExist');
                    });

                    it('should revert when attempting to stake rewards for non-existing programs', async () => {
                        await expect(standardRewards.connect(provider).stakeRewards([10_000])).to.be.revertedWithError(
                            'DoesNotExist'
                        );

                        await expect(
                            standardRewards.connect(provider).stakeRewards([programData.id, 10_000])
                        ).to.be.revertedWithError('DoesNotExist');
                    });

                    it('should revert when attempting to claim rewards with duplicate ids', async () => {
                        await expect(
                            standardRewards.connect(provider).claimRewards([10_000, 10_000])
                        ).to.be.revertedWithError('ArrayNotUnique');

                        await expect(
                            standardRewards.connect(provider).claimRewards([programData.id, programData.id])
                        ).to.be.revertedWithError('ArrayNotUnique');
                    });

                    it('should revert when attempting to stake rewards with duplicate ids', async () => {
                        await expect(
                            standardRewards.connect(provider).stakeRewards([10_000, 10_000])
                        ).to.be.revertedWithError('ArrayNotUnique');

                        await expect(
                            standardRewards.connect(provider).stakeRewards([programData.id, programData.id])
                        ).to.be.revertedWithError('ArrayNotUnique');
                    });

                    context('when the active program was paused', () => {
                        beforeEach(async () => {
                            await standardRewards.pauseProgram(programData.id, true);
                        });

                        it('should revert', async () => {
                            await expect(
                                standardRewards.connect(provider).claimRewards([programData.id])
                            ).to.be.revertedWithError('ProgramSuspended');
                        });

                        it('should revert', async () => {
                            await expect(
                                standardRewards.connect(provider).stakeRewards([programData.id])
                            ).to.be.revertedWithError('ProgramSuspended');
                        });
                    });

                    context('with staked tokens', () => {
                        beforeEach(async () => {
                            const amount = toWei(10_000);
                            await programData.poolToken.connect(provider).approve(standardRewards.address, amount);
                            await standardRewards.connect(provider).join(programData.id, amount);

                            await increaseTime(standardRewards, duration.weeks(1));
                        });

                        it('should revert when attempting to accidentally claim more tokens than possible', async () => {
                            const pendingRewards = await standardRewards.pendingRewards(provider.address, [
                                programData.id
                            ]);

                            await standardRewards.setRemainingRewards(programData.id, pendingRewards.sub(1));

                            await expect(
                                standardRewards.connect(provider).claimRewards([programData.id])
                            ).to.be.revertedWithError('RewardsTooHigh');
                        });
                    });
                });
            };

            const programSpecToString = (programSpec: ProgramSpec) =>
                `(pool=${
                    programSpec.poolSymbol
                }, initialBalance=${programSpec.initialBalance.toString()}, stakes=[${programSpec.providerStakes.map(
                    (s) => s.toString()
                )}])`;

            const rewardSpecToString = (rewardsSpec: RewardsSpec) => {
                return `(totalRewards=${rewardsSpec.totalRewards.toString()}, duration=${humanizeDuration(
                    rewardsSpec.duration * 1000,
                    { units: ['d'] }
                )})`;
            };

            const testClaiming = (programSpec: ProgramSpec, programSpec2: ProgramSpec, rewardsSpec: RewardsSpec) => {
                let ids: number[];

                describe(`full tests ${programSpecToString(programSpec)}, ${programSpecToString(
                    programSpec2
                )}, ${rewardSpecToString(rewardsSpec)}`, () => {
                    let programsData: Record<number, ProgramData>;
                    let rewardsData: RewardsData;
                    let rewardsPoolData: RewardsPoolData;

                    beforeEach(async () => {
                        ids = [];
                        programsData = {};

                        rewardsData = await setupRewardsData(rewardsSpec);

                        for (const spec of [programSpec, programSpec2]) {
                            const data = await setupProgram(spec, rewardsData);
                            programsData[data.id] = data;

                            ids.push(data.id);
                        }

                        rewardsPoolData = {
                            poolData: new TokenData(TokenSymbol.BNT),
                            pool: bnt,
                            poolToken: bntPoolToken
                        };

                        await prepareSimplePool(rewardsPoolData.poolData, INITIAL_BALANCE);
                    });

                    const getExpectedFullRewards = (provider: SignerWithAddress, id: number) => {
                        const programRewardsData = rewardsData.programRewardsData[id];

                        const totalStake = programRewardsData.totalStake;
                        const stake = programRewardsData.stakes[provider.address];

                        if (totalStake.isZero()) {
                            return BigNumber.from(0);
                        }

                        if (now < rewardsData.startTime) {
                            return BigNumber.from(0);
                        }

                        const effectiveEndTime = now >= rewardsData.endTime ? rewardsData.endTime : now;
                        return stake
                            .mul(effectiveEndTime - rewardsData.startTime)
                            .mul(rewardsData.rewardRate)
                            .div(totalStake);
                    };

                    const snapshotRewards = () => {
                        for (const id of Object.keys(programsData).map((k) => Number(k))) {
                            if (!rewardsData.programRewardsData[id]) {
                                rewardsData.programRewardsData[id] = {
                                    totalStake: BigNumber.from(0),
                                    stakes: {},
                                    pendingRewards: {},
                                    claimedRewards: {}
                                };
                            }

                            const programRewardsData = rewardsData.programRewardsData[id];

                            for (const p of providers) {
                                if (!programRewardsData.stakes[p.address]) {
                                    programRewardsData.stakes[p.address] = BigNumber.from(0);
                                }

                                if (!programRewardsData.pendingRewards[p.address]) {
                                    programRewardsData.pendingRewards[p.address] = BigNumber.from(0);
                                }

                                if (!programRewardsData.claimedRewards[p.address]) {
                                    programRewardsData.claimedRewards[p.address] = BigNumber.from(0);
                                }

                                programRewardsData.pendingRewards[p.address] = getExpectedFullRewards(p, id).sub(
                                    programRewardsData.claimedRewards[p.address]
                                );
                            }
                        }
                    };

                    const getExpectedRewards = (provider: SignerWithAddress, id: number) => {
                        const programRewardsData = rewardsData.programRewardsData[id];

                        if (!programRewardsData) {
                            return BigNumber.from(0);
                        }

                        return programRewardsData.pendingRewards[provider.address] || BigNumber.from(0);
                    };

                    const increaseStake = (provider: SignerWithAddress, id: number, amount: BigNumberish) => {
                        const programRewardsData = rewardsData.programRewardsData[id];

                        if (!programRewardsData.totalStake) {
                            programRewardsData.totalStake = BigNumber.from(0);
                        }

                        programRewardsData.totalStake = programRewardsData.totalStake.add(amount);

                        if (!programRewardsData.stakes[provider.address]) {
                            programRewardsData.stakes[provider.address] = BigNumber.from(0);
                        }

                        programRewardsData.stakes[provider.address] =
                            programRewardsData.stakes[provider.address].add(amount);

                        if (!programRewardsData.pendingRewards[provider.address]) {
                            programRewardsData.pendingRewards[provider.address] = BigNumber.from(0);
                        }

                        if (!programRewardsData.claimedRewards[provider.address]) {
                            programRewardsData.claimedRewards[provider.address] = BigNumber.from(0);
                        }
                    };

                    const decreaseStake = (provider: SignerWithAddress, id: number, amount: BigNumberish) => {
                        const programRewardsData = rewardsData.programRewardsData[id];

                        expect(programRewardsData.totalStake).to.be.gte(amount);

                        programRewardsData.totalStake = programRewardsData.totalStake.sub(amount);

                        expect(programRewardsData.stakes[provider.address]).to.be.gte(amount);

                        programRewardsData.stakes[provider.address] =
                            programRewardsData.stakes[provider.address].sub(amount);
                    };

                    const join = async (provider: SignerWithAddress, id: number, amount: BigNumberish) => {
                        snapshotRewards();

                        increaseStake(provider, id, amount);

                        const programData = programsData[id];
                        await programData.poolToken.connect(provider).approve(standardRewards.address, amount);
                        return standardRewards.connect(provider).join(id, amount);
                    };

                    const leave = async (provider: SignerWithAddress, id: number, amount: BigNumberish) => {
                        snapshotRewards();

                        decreaseStake(provider, id, amount);

                        return standardRewards.connect(provider).leave(id, amount);
                    };

                    const joinPortion = async (portions: number[]) => {
                        snapshotRewards();

                        const [id, id2] = ids;

                        for (const p of providers) {
                            await join(
                                p,
                                id,
                                programsData[id].providerPoolTokenAmounts[p.address]
                                    .mul(portions[0])
                                    .div(PPM_RESOLUTION)
                            );

                            await join(
                                p,
                                id2,
                                programsData[id2].providerPoolTokenAmounts[p.address]
                                    .mul(portions[1])
                                    .div(PPM_RESOLUTION)
                            );
                        }
                    };

                    const leavePortion = async (portions: number[]) => {
                        snapshotRewards();

                        const [id, id2] = ids;

                        for (const p of providers) {
                            await leave(
                                p,
                                id,
                                programsData[id].providerPoolTokenAmounts[p.address]
                                    .mul(portions[0])
                                    .div(PPM_RESOLUTION)
                            );

                            await leave(
                                p,
                                id2,
                                programsData[id2].providerPoolTokenAmounts[p.address]
                                    .mul(portions[1])
                                    .div(PPM_RESOLUTION)
                            );
                        }
                    };

                    const stakeOrClaim = async (stake: boolean, provider: SignerWithAddress, ids: number[]) => {
                        snapshotRewards();

                        const claimed = await standardRewards.connect(provider).callStatic.claimRewardsWithAmounts(ids);

                        for (const [i, id] of ids.entries()) {
                            const programRewardsData = rewardsData.programRewardsData[id];

                            programRewardsData.claimedRewards[provider.address] = programRewardsData.claimedRewards[
                                provider.address
                            ].add(claimed[i]);
                        }

                        let totalClaimed: BigNumber;
                        let poolTokenAmount = BigNumber.from(0);
                        let res: ContractTransaction;

                        if (stake) {
                            const stakeAmounts = await standardRewards.connect(provider).callStatic.stakeRewards(ids);

                            ({ poolTokenAmount, stakedRewardAmount: totalClaimed } = stakeAmounts);

                            res = await standardRewards.connect(provider).stakeRewards(ids);
                        } else {
                            totalClaimed = await standardRewards.connect(provider).callStatic.claimRewards(ids);

                            res = await standardRewards.connect(provider).claimRewards(ids);
                        }

                        expect(claimed.reduce((res, c) => res.add(c), BigNumber.from(0))).to.equal(totalClaimed);

                        // ensure that claiming again yields no pending rewards
                        const claimed2 = await standardRewards
                            .connect(provider)
                            .callStatic.claimRewardsWithAmounts(ids);

                        for (const amount of claimed2) {
                            expect(amount).to.equal(0);
                        }

                        return { totalClaimed, claimed, poolTokenAmount, res };
                    };

                    const testProviderPendingRewards = async (provider: SignerWithAddress) => {
                        snapshotRewards();

                        const [id, id2] = ids;

                        expect(await standardRewards.pendingRewards(provider.address, [id])).to.be.almostEqual(
                            getExpectedRewards(provider, id),
                            {
                                maxAbsoluteError: new Decimal(1),
                                maxRelativeError: new Decimal('0.00000000000000001'),
                                relation: Relation.LesserOrEqual
                            }
                        );

                        expect(await standardRewards.pendingRewards(provider.address, [id])).to.be.almostEqual(
                            getExpectedRewards(provider, id2),
                            {
                                maxAbsoluteError: new Decimal(1),
                                maxRelativeError: new Decimal('0.00000000000000001'),
                                relation: Relation.LesserOrEqual
                            }
                        );

                        expect(await standardRewards.pendingRewards(provider.address, [id, id2])).to.be.almostEqual(
                            getExpectedRewards(provider, id).add(getExpectedRewards(provider, id2)),
                            {
                                maxRelativeError: new Decimal('0.00000000000000001'),
                                relation: Relation.LesserOrEqual
                            }
                        );
                    };

                    const testPendingRewards = async () => {
                        snapshotRewards();

                        for (const p of providers) {
                            await testProviderPendingRewards(p);
                        }
                    };

                    const testStakeOrClaimRewards = async (stake: boolean) => {
                        snapshotRewards();

                        const [id, id2] = ids;

                        for (const p of providers) {
                            const expectedProgramReward = getExpectedRewards(p, id);
                            const expectedProgramReward2 = getExpectedRewards(p, id2);

                            expect(await standardRewards.pendingRewards(p.address, ids)).to.be.almostEqual(
                                expectedProgramReward.add(expectedProgramReward2),
                                {
                                    maxAbsoluteError: new Decimal(2),
                                    maxRelativeError: new Decimal('0.00000000000000001')
                                }
                            );

                            const expectedTotalClaimedReward = expectedProgramReward.add(expectedProgramReward2);

                            const programData = programsData[id];
                            const programData2 = programsData[id2];

                            const prevProviderBalance = await getBalance(bnt, p);
                            const prevProviderVBNTBalance = await vbnt.balanceOf(p.address);
                            const prevMasterVaultBalance = await getBalance(bnt, masterVault);
                            const prevContractVaultBalance = await getBalance(bnt, standardRewards);
                            const prevBntTotalSupply = await bnt.totalSupply();

                            const prevProviderRewardsPoolTokenBalance = await rewardsPoolData.poolToken.balanceOf(
                                p.address
                            );

                            const prevProviderProgramIds = (await standardRewards.providerProgramIds(p.address)).map(
                                (id) => id.toNumber()
                            );

                            const prevPrograms = await standardRewards.programs(ids);
                            const [prevProgram, prevProgram2] = prevPrograms;

                            const { totalClaimed, claimed, poolTokenAmount, res } = await stakeOrClaim(stake, p, ids);
                            const [claimedProgram, claimedProgram2] = claimed;

                            expect(totalClaimed).to.be.almostEqual(expectedTotalClaimedReward, {
                                maxRelativeError: new Decimal('0.00000000000000001')
                            });

                            const programRewards = await standardRewards.programRewards(id);
                            const providerRewards = await standardRewards.providerRewards(p.address, id);
                            expect(providerRewards.rewardPerTokenPaid).to.equal(programRewards.rewardPerToken);

                            if (!claimedProgram.isZero()) {
                                await expect(res)
                                    .to.emit(standardRewards, stake ? 'RewardsStaked' : 'RewardsClaimed')
                                    .withArgs(programData.pool.address, programData.id, p.address, claimedProgram);
                            }

                            if (!claimedProgram2.isZero()) {
                                await expect(res)
                                    .to.emit(standardRewards, stake ? 'RewardsStaked' : 'RewardsClaimed')
                                    .withArgs(programData2.pool.address, programData2.id, p.address, claimedProgram2);
                            }

                            const programs = await standardRewards.programs(ids);
                            const [program, program2] = programs;

                            expect(program.remainingRewards).to.equal(prevProgram.remainingRewards.sub(claimedProgram));
                            expect(program2.remainingRewards).to.equal(
                                prevProgram2.remainingRewards.sub(claimedProgram2)
                            );

                            // ensure that the program has been removed from provider's programs if it's no longer
                            // active, the provider has removed all of its stake, and there are no pending rewards
                            for (const i of ids) {
                                const pendingRewards = await standardRewards.pendingRewards(p.address, [i]);
                                const providerStake = await standardRewards.providerStake(p.address, i);
                                const isProgramActive = await standardRewards.isProgramActive(i);
                                const providerProgramIds = (await standardRewards.providerProgramIds(p.address)).map(
                                    (id) => id.toNumber()
                                );

                                if (prevProviderProgramIds.includes(i)) {
                                    if (!isProgramActive && pendingRewards.isZero() && providerStake.isZero()) {
                                        expect(providerProgramIds).to.not.include(i);
                                    } else {
                                        expect(providerProgramIds).to.include(i);
                                    }
                                }
                            }

                            if (stake) {
                                if (claimedProgram.add(claimedProgram2).eq(0)) {
                                    expect(poolTokenAmount).to.equal(0);
                                } else {
                                    expect(poolTokenAmount).not.to.equal(0);
                                }

                                expect(await rewardsPoolData.poolToken.balanceOf(p.address)).to.equal(
                                    prevProviderRewardsPoolTokenBalance.add(poolTokenAmount)
                                );
                                expect(await getBalance(bnt, p)).to.equal(prevProviderBalance);
                                expect(await vbnt.balanceOf(p.address)).to.equal(
                                    prevProviderVBNTBalance.add(poolTokenAmount)
                                );

                                // in any case, there shouldn't be any newly minted BNT tokens since either the rewards
                                // token isn't BNT in the first place or all the newly minted tokens should have been
                                // burned again by the BNT pool
                                expect(await bnt.totalSupply()).to.equal(prevBntTotalSupply);

                                expect(await getBalance(bnt, masterVault)).to.equal(prevMasterVaultBalance);
                            } else {
                                expect(poolTokenAmount).to.equal(0);
                                expect(await rewardsPoolData.poolToken.balanceOf(p.address)).to.equal(
                                    prevProviderRewardsPoolTokenBalance
                                );

                                expect(await getBalance(bnt, p)).to.equal(prevProviderBalance.add(totalClaimed));
                                expect(await getBalance(bnt, masterVault)).to.equal(prevMasterVaultBalance);
                                expect(await vbnt.balanceOf(p.address)).to.equal(prevProviderVBNTBalance);

                                expect(await bnt.totalSupply()).to.equal(prevBntTotalSupply.add(totalClaimed));
                            }

                            expect(await getBalance(bnt, standardRewards)).to.equal(prevContractVaultBalance);
                        }
                    };

                    const testClaimRewards = async () => testStakeOrClaimRewards(false);
                    const testStakeRewards = async () => testStakeOrClaimRewards(true);

                    it('should properly claim rewards', async () => {
                        // pending rewards should be 0 before the beginning of the program
                        await setTime(standardRewards, rewardsData.startTime - duration.days(1));

                        await testPendingRewards();
                        await testClaimRewards();

                        await setTime(standardRewards, rewardsData.startTime);

                        // pending rewards should be 0 prior to joining
                        await testPendingRewards();
                        await testClaimRewards();

                        // join with [30%, 50%] of the initial pool token amount
                        await joinPortion([toPPM(30), toPPM(50)]);

                        // pending rewards should be 0 immediately after joining
                        await testPendingRewards();

                        // increase the staking duration
                        await increaseTime(standardRewards, duration.days(1));

                        // ensure that pending rewards are correct
                        await testPendingRewards();

                        // join with additional 20% of the initial pool token amount
                        await joinPortion([toPPM(20), toPPM(20)]);

                        // increase the staking duration
                        await increaseTime(standardRewards, duration.weeks(1));

                        // ensure that claiming rewards works properly
                        await testClaimRewards();

                        // leave additional [20%, 10%] of the initial pool token amount
                        await leavePortion([toPPM(20), toPPM(10)]);

                        // increase the staking duration
                        await increaseTime(standardRewards, duration.days(3));

                        // ensure that claiming rewards works properly
                        await testClaimRewards();

                        // increase the staking duration
                        await increaseTime(standardRewards, duration.weeks(1));

                        // join with additional 5% of the initial pool token amount
                        await joinPortion([toPPM(5), toPPM(5)]);

                        // ensure that the program has finished
                        await setTime(standardRewards, rewardsData.endTime + duration.weeks(2));

                        // ensure that claiming all remaining rewards, from an inactive programs, works properly
                        await testClaimRewards();
                    });

                    it('should properly stake rewards', async () => {
                        // pending rewards should be 0 before the beginning of the program
                        await setTime(standardRewards, rewardsData.startTime - duration.days(1));

                        // pending rewards should be 0 prior to joining
                        await testPendingRewards();
                        await testStakeRewards();

                        await setTime(standardRewards, rewardsData.startTime);

                        // pending rewards should be 0 prior to joining
                        await testPendingRewards();
                        await testStakeRewards();

                        // join with [20%, 40%] of the initial pool token amount
                        await joinPortion([toPPM(20), toPPM(40)]);

                        // increase the staking duration
                        await increaseTime(standardRewards, duration.weeks(4));

                        // pending rewards should be 0 immediately after joining
                        await testPendingRewards();

                        // increase the staking duration
                        await increaseTime(standardRewards, duration.weeks(1));

                        // ensure that staking rewards works properly
                        await testStakeRewards();

                        // increase the staking duration
                        await increaseTime(standardRewards, duration.days(1));

                        // pending rewards should be 0 immediately after joining
                        await testPendingRewards();

                        // join with additional 20% of the initial pool token amount
                        await joinPortion([toPPM(20), toPPM(20)]);

                        // ensure that the program has finished
                        await setTime(standardRewards, rewardsData.endTime + duration.weeks(2));

                        // ensure that staking all remaining rewards, from an inactive programs, works properly
                        await testStakeRewards();
                    });
                });
            };

            for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                context(`${poolSymbol} pool`, () => {
                    testBasicClaiming(
                        {
                            poolSymbol,
                            initialBalance: toWei(100_000),
                            providerStakes: [toWei(10_000), toWei(20_000)]
                        },
                        {
                            duration: duration.weeks(12),
                            totalRewards: toWei(50_000)
                        }
                    );

                    for (const poolSymbol2 of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                        if (poolSymbol === poolSymbol2) {
                            continue;
                        }

                        context(`and ${poolSymbol2} pool`, () => {
                            for (const initialBalance of [toWei(1_000_000)]) {
                                for (const providerStake of [toWei(100_000)]) {
                                    for (const providerStake2 of [toWei(200_000)]) {
                                        for (const totalRewards of [toWei(1_000_000)]) {
                                            for (const programDuration of [duration.weeks(12)]) {
                                                testClaiming(
                                                    {
                                                        poolSymbol,
                                                        initialBalance,
                                                        providerStakes: [providerStake, providerStake2]
                                                    },
                                                    {
                                                        poolSymbol: poolSymbol2,
                                                        initialBalance,
                                                        providerStakes: [providerStake, providerStake2]
                                                    },
                                                    {
                                                        duration: programDuration,
                                                        totalRewards
                                                    }
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                });
            }
        });
    });
});
