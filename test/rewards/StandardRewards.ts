import Contracts, {
    BancorNetworkInfo,
    ExternalRewardsVault,
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
import { MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
import { permitSignature } from '../../utils/Permit';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import {
    createStandardRewards,
    createSystem,
    createTestToken,
    createToken,
    depositToPool,
    setupFundedPool,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { createWallet, getBalance, getTransactionCost, transfer } from '../helpers/Utils';
import { Relation } from '../matchers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish, ContractTransaction, Wallet } from 'ethers';
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
    let poolCollection: TestPoolCollection;
    let externalRewardsVault: ExternalRewardsVault;
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

    const prepareSimplePool = async (
        poolData: TokenData,
        rewardsData: TokenData,
        rewardsToken: TokenWithAddress,
        initialBalance: BigNumberish,
        totalRewards: BigNumberish
    ) => {
        // deposit initial stake so that the participating user would have some initial amount of pool tokens
        const { token, poolToken } = await setupFundedPool(
            {
                tokenData: poolData,
                // if the pool is the same as the rewards token - don't create a new token for the pool
                token: poolData.symbol() === rewardsData.symbol() ? rewardsToken : undefined,
                balance: initialBalance,
                requestedLiquidity: poolData.isBNT() ? BigNumber.from(initialBalance).mul(1000) : 0,
                bntVirtualBalance: 1,
                baseTokenVirtualBalance: 2
            },
            deployer,
            network,
            networkInfo,
            networkSettings,
            poolCollection
        );

        // if we're rewarding BNT - no additional funding is needed
        if (!rewardsData.isBNT()) {
            await transfer(deployer, rewardsToken, externalRewardsVault, totalRewards);
        }

        return { token, poolToken };
    };

    const createProgram = async (
        standardRewards: TestStandardRewards,
        pool: TokenWithAddress,
        rewardsToken: TokenWithAddress,
        totalRewards: BigNumberish,
        startTime: number,
        endTime: number
    ) => {
        const id = await standardRewards.callStatic.createProgram(
            pool.address,
            rewardsToken.address,
            totalRewards,
            startTime,
            endTime
        );

        await standardRewards.createProgram(pool.address, rewardsToken.address, totalRewards, startTime, endTime);

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
            ({
                network,
                networkInfo,
                networkSettings,
                bnt,
                vbnt,
                bntGovernance,
                bntPool,
                externalRewardsVault,
                masterVault,
                poolCollection
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    ZERO_ADDRESS,
                    networkSettings.address,
                    bntGovernance.address,
                    vbnt.address,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    bntGovernance.address,
                    vbnt.address,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    vbnt.address,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid VBNT contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bntGovernance.address,
                    ZERO_ADDRESS,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT pool contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bntGovernance.address,
                    vbnt.address,
                    ZERO_ADDRESS,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external rewards vault contract', async () => {
            await expect(
                Contracts.StandardRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bntGovernance.address,
                    vbnt.address,
                    bntPool.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            const standardRewards = await createStandardRewards(
                network,
                networkSettings,
                bntGovernance,
                vbnt,
                bntPool,
                externalRewardsVault
            );

            await expect(standardRewards.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const standardRewards = await createStandardRewards(
                network,
                networkSettings,
                bntGovernance,
                vbnt,
                bntPool,
                externalRewardsVault
            );

            expect(await standardRewards.version()).to.equal(3);

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
            ({
                network,
                networkInfo,
                networkSettings,
                bnt,
                vbnt,
                bntGovernance,
                bntPool,
                externalRewardsVault,
                masterVault,
                poolCollection
            } = await createSystem());

            standardRewards = await createStandardRewards(
                network,
                networkSettings,
                bntGovernance,
                vbnt,
                bntPool,
                externalRewardsVault
            );

            await setTime(standardRewards, now);
        });

        describe('creation', () => {
            describe('basic tests', () => {
                let pool: TokenWithAddress;
                let rewardsToken: TokenWithAddress;

                let nonAdmin: SignerWithAddress;

                before(async () => {
                    [, nonAdmin] = await ethers.getSigners();
                });

                beforeEach(async () => {
                    rewardsToken = await createTestToken();

                    ({ token: pool } = await prepareSimplePool(
                        new TokenData(TokenSymbol.TKN),
                        new TokenData(TokenSymbol.TKN),
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));
                });

                it('should revert when a non-admin is attempting to create a program', async () => {
                    await expect(
                        standardRewards
                            .connect(nonAdmin)
                            .createProgram(pool.address, bnt.address, TOTAL_REWARDS, now, now + duration.days(1))
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should revert when attempting to create a program with for an invalid pool', async () => {
                    await expect(
                        standardRewards.createProgram(
                            ZERO_ADDRESS,
                            bnt.address,
                            TOTAL_REWARDS,
                            now,
                            now + duration.days(1)
                        )
                    ).to.be.revertedWith('InvalidAddress');

                    const token2 = await createTestToken();

                    await expect(
                        standardRewards.createProgram(
                            token2.address,
                            bnt.address,
                            TOTAL_REWARDS,
                            now,
                            now + duration.days(1)
                        )
                    ).to.be.revertedWith('NotWhitelisted');
                });

                it('should revert when attempting to create a program with an invalid reward token', async () => {
                    await expect(
                        standardRewards.createProgram(
                            pool.address,
                            ZERO_ADDRESS,
                            TOTAL_REWARDS,
                            now,
                            now + duration.days(1)
                        )
                    ).to.be.revertedWith('InvalidAddress');
                });

                it('should revert when attempting to create a program with an invalid total rewards amount', async () => {
                    await expect(
                        standardRewards.createProgram(pool.address, bnt.address, 0, now, now + duration.days(1))
                    ).to.be.revertedWith('ZeroValue');
                });

                it('should revert when attempting to create a program with an invalid start/end time', async () => {
                    await expect(
                        standardRewards.createProgram(
                            pool.address,
                            bnt.address,
                            TOTAL_REWARDS,
                            now - 1,
                            now + duration.days(1)
                        )
                    ).to.be.revertedWith('InvalidParam');

                    await expect(
                        standardRewards.createProgram(
                            pool.address,
                            bnt.address,
                            TOTAL_REWARDS,
                            now + duration.days(1),
                            now
                        )
                    ).to.be.revertedWith('InvalidParam');
                });
            });

            const testCreateProgram = (poolSymbol: TokenSymbol, rewardsSymbol: TokenSymbol) => {
                const poolData = new TokenData(poolSymbol);
                const rewardsData = new TokenData(rewardsSymbol);
                let pool: TokenWithAddress;
                let rewardsToken: TokenWithAddress;
                let poolToken: IPoolToken;
                let startTime: number;
                let endTime: number;

                beforeEach(async () => {
                    startTime = now;
                    endTime = now + duration.weeks(12);

                    if (rewardsData.isBNT()) {
                        rewardsToken = bnt;
                    } else {
                        rewardsToken = await createToken(new TokenData(rewardsSymbol));
                    }

                    ({ token: pool, poolToken } = await prepareSimplePool(
                        poolData,
                        rewardsData,
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));
                });

                const testProgram = async (
                    pool: TokenWithAddress,
                    rewardsToken: TokenWithAddress,
                    totalRewards: BigNumberish,
                    startTime: number,
                    endTime: number
                ) => {
                    const id = await standardRewards.nextProgramId();
                    const prevUnclaimedRewards = await standardRewards.unclaimedRewards(rewardsToken.address);

                    expect((await standardRewards.programIds()).map((id) => id.toNumber())).not.to.include(
                        id.toNumber()
                    );
                    expect(await standardRewards.isProgramActive(id)).to.be.false;
                    expect(await standardRewards.isProgramEnabled(id)).to.be.false;

                    const res = await standardRewards.createProgram(
                        pool.address,
                        rewardsToken.address,
                        totalRewards,
                        startTime,
                        endTime
                    );

                    await expect(res)
                        .to.emit(standardRewards, 'ProgramCreated')
                        .withArgs(pool.address, id, rewardsToken.address, totalRewards, startTime, endTime);

                    expect((await standardRewards.programIds()).map((id) => id.toNumber())).to.include(id.toNumber());
                    expect(await standardRewards.isProgramActive(id)).to.be.true;
                    expect(await standardRewards.isProgramEnabled(id)).to.be.true;
                    expect(await standardRewards.latestProgramId(pool.address)).to.equal(id);
                    expect(await standardRewards.unclaimedRewards(rewardsToken.address)).to.equal(
                        prevUnclaimedRewards.add(totalRewards)
                    );

                    const [program] = await standardRewards.programs([id]);

                    expect(program.id).to.equal(id);
                    expect(program.pool).to.equal(pool.address);
                    expect(program.poolToken).to.equal(poolToken.address);
                    expect(program.rewardsToken).to.equal(rewardsToken.address);
                    expect(program.isEnabled).to.equal(true);
                    expect(program.startTime).to.equal(startTime);
                    expect(program.endTime).to.equal(endTime);
                    expect(program.rewardRate).to.equal(BigNumber.from(totalRewards).div(endTime - startTime));
                    expect(program.remainingRewards).to.equal(program.rewardRate.mul(endTime - startTime));
                };

                if (!rewardsData.isBNT()) {
                    it('should revert when attempting to create a program without providing sufficient rewards', async () => {
                        await expect(
                            standardRewards.createProgram(
                                pool.address,
                                rewardsToken.address,
                                TOTAL_REWARDS.add(1),
                                startTime,
                                endTime
                            )
                        ).to.be.revertedWith('InsufficientFunds');
                    });
                }

                it('should allow creating a program', async () => {
                    await testProgram(pool, rewardsToken, TOTAL_REWARDS, now, now + duration.weeks(12));
                });

                context('with an existing active program', () => {
                    let id: BigNumber;

                    const TOTAL_REWARDS2 = toWei(1000);

                    beforeEach(async () => {
                        id = await createProgram(
                            standardRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );
                    });

                    it('should revert', async () => {
                        await expect(
                            standardRewards.createProgram(
                                pool.address,
                                rewardsToken.address,
                                TOTAL_REWARDS2,
                                startTime,
                                endTime
                            )
                        ).to.be.revertedWith('AlreadyExists');
                    });

                    context('when the active program was disabled', () => {
                        beforeEach(async () => {
                            await standardRewards.enableProgram(id, false);
                        });

                        it('should revert', async () => {
                            await expect(
                                standardRewards.createProgram(
                                    pool.address,
                                    rewardsToken.address,
                                    TOTAL_REWARDS2,
                                    startTime,
                                    endTime
                                )
                            ).to.be.revertedWith('AlreadyExists');
                        });
                    });

                    context('after the active program has ended', () => {
                        beforeEach(async () => {
                            await setTime(standardRewards, endTime + 1);
                        });

                        if (!rewardsData.isBNT()) {
                            context('with insufficient additional rewards', () => {
                                it('should revert', async () => {
                                    await expect(
                                        standardRewards.createProgram(
                                            pool.address,
                                            rewardsToken.address,
                                            TOTAL_REWARDS2,
                                            now,
                                            now + duration.days(1)
                                        )
                                    ).to.be.revertedWith('InsufficientFunds');
                                });
                            });
                        }

                        context('with additional rewards', () => {
                            beforeEach(async () => {
                                if (!rewardsData.isBNT()) {
                                    await transfer(deployer, rewardsToken, externalRewardsVault, TOTAL_REWARDS2);
                                }
                            });

                            it('should allow creating a program', async () => {
                                await testProgram(pool, rewardsToken, TOTAL_REWARDS2, now, now + duration.weeks(12));
                            });
                        });
                    });

                    context('when the active program was terminated', () => {
                        beforeEach(async () => {
                            await standardRewards.terminateProgram(id);
                        });

                        if (!rewardsData.isBNT()) {
                            context('with insufficient additional rewards', () => {
                                it('should revert', async () => {
                                    await expect(
                                        standardRewards.createProgram(
                                            pool.address,
                                            rewardsToken.address,
                                            TOTAL_REWARDS2,
                                            startTime,
                                            endTime
                                        )
                                    ).to.be.revertedWith('InsufficientFunds');
                                });
                            });
                        }

                        context('with additional rewards', () => {
                            beforeEach(async () => {
                                if (!rewardsData.isBNT()) {
                                    await transfer(deployer, rewardsToken, externalRewardsVault, TOTAL_REWARDS2);
                                }
                            });

                            it('should allow creating a program', async () => {
                                await testProgram(pool, rewardsToken, TOTAL_REWARDS2, now, now + duration.weeks(12));
                            });
                        });
                    });
                });
            };

            for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                for (const rewardsSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                    context(`${poolSymbol} pool with ${rewardsSymbol} rewards`, () => {
                        testCreateProgram(poolSymbol, rewardsSymbol);
                    });
                }
            }
        });

        describe('termination', () => {
            let pool: TokenWithAddress;
            let poolToken: IPoolToken;
            let poolTokenAmount: BigNumber;
            let rewardsToken: TokenWithAddress;

            let nonAdmin: SignerWithAddress;
            let provider: SignerWithAddress;

            const DEPOSIT_AMOUNT = toWei(10_000);

            before(async () => {
                [, provider, nonAdmin] = await ethers.getSigners();
            });

            beforeEach(async () => {
                rewardsToken = await createTestToken();

                ({ token: pool, poolToken } = await prepareSimplePool(
                    new TokenData(TokenSymbol.TKN),
                    new TokenData(TokenSymbol.TKN),
                    rewardsToken,
                    INITIAL_BALANCE,
                    TOTAL_REWARDS
                ));

                await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);
                await depositToPool(provider, pool, DEPOSIT_AMOUNT, network);
                poolTokenAmount = await poolToken.balanceOf(provider.address);
            });

            it('should revert when a non-admin is attempting to terminate a program', async () => {
                await expect(standardRewards.connect(nonAdmin).terminateProgram(1)).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to terminate a non-existing program', async () => {
                await expect(standardRewards.terminateProgram(1)).to.be.revertedWith('DoesNotExist');
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

                    id = await createProgram(standardRewards, pool, rewardsToken, TOTAL_REWARDS, startTime, endTime);

                    await poolToken.connect(provider).approve(standardRewards.address, poolTokenAmount);
                    await standardRewards.connect(provider).join(id, poolTokenAmount);

                    await increaseTime(standardRewards, duration.seconds(1));
                });

                const testTerminate = async () => {
                    const prevUnclaimedRewards = await standardRewards.unclaimedRewards(rewardsToken.address);
                    const prevRewards = await standardRewards.pendingRewards(provider.address, [id]);
                    const [prevProgram] = await standardRewards.programs([id]);

                    const res = await standardRewards.terminateProgram(id);

                    const remainingRewards = now >= endTime ? 0 : rewardRate.mul(endTime - now);
                    await expect(res)
                        .to.emit(standardRewards, 'ProgramTerminated')
                        .withArgs(pool.address, id, endTime, remainingRewards);

                    expect(await standardRewards.isProgramActive(id)).to.be.false;

                    expect(await standardRewards.unclaimedRewards(rewardsToken.address)).to.equal(
                        prevUnclaimedRewards.sub(remainingRewards)
                    );

                    const [program] = await standardRewards.programs([id]);
                    expect(program.startTime).to.equal(prevProgram.startTime);
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

                context('when the active program was disabled', () => {
                    beforeEach(async () => {
                        await standardRewards.enableProgram(id, false);
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
                        await expect(standardRewards.terminateProgram(id)).to.be.revertedWith('ProgramInactive');
                    });
                });

                context('when the active program was terminated', () => {
                    beforeEach(async () => {
                        await standardRewards.terminateProgram(id);
                    });

                    it('should revert', async () => {
                        await expect(standardRewards.terminateProgram(id)).to.be.revertedWith('ProgramInactive');
                    });
                });
            });
        });

        describe('enabling/disabling', () => {
            let pool: TokenWithAddress;
            let rewardsToken: TokenWithAddress;

            let nonAdmin: SignerWithAddress;

            before(async () => {
                [, nonAdmin] = await ethers.getSigners();
            });

            beforeEach(async () => {
                rewardsToken = await createTestToken();

                ({ token: pool } = await prepareSimplePool(
                    new TokenData(TokenSymbol.TKN),
                    new TokenData(TokenSymbol.TKN),
                    rewardsToken,
                    INITIAL_BALANCE,
                    TOTAL_REWARDS
                ));
            });

            it('should revert when a non-admin is attempting to enable/disable a program', async () => {
                for (const status of [true, false]) {
                    await expect(standardRewards.connect(nonAdmin).enableProgram(1, status)).to.be.revertedWith(
                        'AccessDenied'
                    );
                }
            });

            it('should revert when attempting to enable/disable a non-existing program', async () => {
                for (const status of [true, false]) {
                    await expect(standardRewards.enableProgram(1, status)).to.be.revertedWith('DoesNotExist');
                }
            });

            context('with an active program', () => {
                let startTime: number;
                let endTime: number;
                let rewardRate: BigNumber;

                let id: BigNumber;

                beforeEach(async () => {
                    startTime = now;
                    endTime = now + duration.weeks(12);
                    rewardRate = TOTAL_REWARDS.div(endTime - startTime);

                    id = await createProgram(standardRewards, pool, rewardsToken, TOTAL_REWARDS, startTime, endTime);
                });

                const testDisableEnable = async () => {
                    expect(await standardRewards.isProgramEnabled(id)).to.be.true;

                    const res = await standardRewards.enableProgram(id, false);

                    const [program] = await standardRewards.programs([id]);
                    const { endTime } = program;
                    const remainingRewards = now >= endTime ? 0 : rewardRate.mul(endTime - now);
                    await expect(res)
                        .to.emit(standardRewards, 'ProgramEnabled')
                        .withArgs(pool.address, id, false, remainingRewards);

                    expect(await standardRewards.isProgramEnabled(id)).to.be.false;

                    const res2 = await standardRewards.enableProgram(id, true);

                    await expect(res2)
                        .to.emit(standardRewards, 'ProgramEnabled')
                        .withArgs(pool.address, id, true, remainingRewards);

                    expect(await standardRewards.isProgramEnabled(id)).to.be.true;
                };

                it('should allow enabling/disabling the program', async () => {
                    await testDisableEnable();
                });

                it('should ignore setting to the same status', async () => {
                    const res = await standardRewards.enableProgram(id, true);

                    await expect(res).not.to.emit(standardRewards, 'ProgramEnabled');

                    await standardRewards.enableProgram(id, false);

                    const res2 = await standardRewards.enableProgram(id, false);
                    await expect(res2).not.to.emit(standardRewards, 'ProgramEnabled');
                });

                context('after the active program has ended', () => {
                    beforeEach(async () => {
                        await setTime(standardRewards, endTime + 1);
                    });

                    it('should allow enabling/disabling the program', async () => {
                        await testDisableEnable();
                    });
                });

                context('when the active program was terminated', () => {
                    beforeEach(async () => {
                        await standardRewards.terminateProgram(id);
                    });

                    it('should allow enabling/disabling the program', async () => {
                        await testDisableEnable();
                    });
                });
            });
        });
    });

    describe('joining/leaving', () => {
        let standardRewards: TestStandardRewards;
        let provider: Wallet;

        const DEPOSIT_AMOUNT = toWei(1000);
        const TOTAL_REWARDS = toWei(10_000);

        beforeEach(async () => {
            ({
                network,
                networkInfo,
                networkSettings,
                bnt,
                vbnt,
                bntGovernance,
                bntPool,
                externalRewardsVault,
                masterVault,
                poolCollection
            } = await createSystem());

            provider = await createWallet();

            standardRewards = await createStandardRewards(
                network,
                networkSettings,
                bntGovernance,
                vbnt,
                bntPool,
                externalRewardsVault
            );

            await setTime(standardRewards, now);
        });

        describe('joining', () => {
            describe('basic tests', () => {
                const testBasicTests = (permitted: boolean) => {
                    let pool: TokenWithAddress;
                    let poolToken: IPoolToken;
                    let poolTokenAmount: BigNumber;
                    let id: BigNumber;

                    beforeEach(async () => {
                        const tokenData = new TokenData(TokenSymbol.TKN);
                        const rewardsToken = await createToken(tokenData);

                        ({ token: pool, poolToken } = await prepareSimplePool(
                            tokenData,
                            tokenData,
                            rewardsToken,
                            INITIAL_BALANCE,
                            TOTAL_REWARDS
                        ));

                        await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);
                        await depositToPool(provider, pool, DEPOSIT_AMOUNT, network);
                        poolTokenAmount = await poolToken.balanceOf(provider.address);

                        id = await createProgram(
                            standardRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            now,
                            now + duration.weeks(12)
                        );
                    });

                    const join = async (id: BigNumberish, amount: BigNumberish) => {
                        if (!permitted) {
                            await poolToken.connect(provider).approve(standardRewards.address, amount);

                            return standardRewards.connect(provider).join(id, amount);
                        }

                        const signature = await permitSignature(
                            provider,
                            poolToken.address,
                            standardRewards,
                            bnt,
                            amount,
                            MAX_UINT256
                        );

                        return standardRewards
                            .connect(provider)
                            .joinPermitted(id, amount, MAX_UINT256, signature.v, signature.r, signature.s);
                    };

                    it('should revert when attempting to join a non-existing program', async () => {
                        await expect(join(0, 1)).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to join with an invalid amount', async () => {
                        await expect(join(1, 0)).to.be.revertedWith('ZeroValue');
                    });

                    it('should join an existing program', async () => {
                        const providerProgramIds = (await standardRewards.providerProgramIds(provider.address)).map(
                            (id) => id.toNumber()
                        );

                        expect(providerProgramIds).not.to.include(id.toNumber());

                        await join(id, poolTokenAmount);

                        expect(
                            (await standardRewards.providerProgramIds(provider.address)).map((id) => id.toNumber())
                        ).to.include(id.toNumber());
                    });

                    if (!permitted) {
                        context('without approving the pool token', () => {
                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWith(new TokenData(TokenSymbol.bnBNT).errors().exceedsAllowance);
                            });
                        });
                    }
                };

                for (const permitted of [false, true]) {
                    context(permitted ? 'permitted' : 'regular', () => {
                        testBasicTests(permitted);
                    });
                }
            });

            const testJoin = (poolSymbol: TokenSymbol, rewardsSymbol: TokenSymbol) => {
                const poolData = new TokenData(poolSymbol);
                const rewardsData = new TokenData(rewardsSymbol);
                let pool: TokenWithAddress;
                let rewardsToken: TokenWithAddress;
                let poolToken: IPoolToken;
                let poolTokenAmount: BigNumber;

                beforeEach(async () => {
                    if (rewardsData.isBNT()) {
                        rewardsToken = bnt;
                    } else {
                        rewardsToken = await createToken(new TokenData(rewardsSymbol));
                    }

                    ({ token: pool, poolToken } = await prepareSimplePool(
                        poolData,
                        rewardsData,
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));

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

                        id = await createProgram(
                            standardRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );
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
                            const prevProviderRewardsTokenBalance = await getBalance(rewardsToken, provider);
                            const prevStandardRewardsBalance = await poolToken.balanceOf(standardRewards.address);
                            const prevRewardsTokenBalance = await getBalance(rewardsToken, standardRewards);

                            const providerProgramIds = (await standardRewards.providerProgramIds(provider.address)).map(
                                (id) => id.toNumber()
                            );

                            if (prevProgramStake.isZero()) {
                                expect(providerProgramIds).not.to.include(id.toNumber());
                            } else {
                                expect(providerProgramIds).to.include(id.toNumber());
                            }

                            const res = await standardRewards.connect(provider).join(id, amount);

                            let transactionCost = BigNumber.from(0);
                            if (rewardsData.isNative()) {
                                transactionCost = await getTransactionCost(res);
                            }

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
                            expect(await getBalance(rewardsToken, provider)).to.equal(
                                prevProviderRewardsTokenBalance.sub(transactionCost)
                            );
                            expect(await poolToken.balanceOf(standardRewards.address)).to.equal(
                                prevStandardRewardsBalance.add(amount)
                            );
                            expect(await getBalance(rewardsToken, standardRewards)).to.equal(prevRewardsTokenBalance);
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

                        context('when the active program was disabled', () => {
                            beforeEach(async () => {
                                await standardRewards.enableProgram(id, false);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWith('ProgramDisabled');
                            });
                        });

                        context('after the active program has ended', () => {
                            beforeEach(async () => {
                                await setTime(standardRewards, endTime + 1);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWith('ProgramInactive');
                            });
                        });

                        context('when the active program was terminated', () => {
                            beforeEach(async () => {
                                await standardRewards.terminateProgram(id);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWith('ProgramInactive');
                            });
                        });
                    });
                });
            };

            for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                for (const rewardsSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                    context(`${poolSymbol} pool with ${rewardsSymbol} rewards`, () => {
                        testJoin(poolSymbol, rewardsSymbol);
                    });
                }
            }
        });

        describe('leaving', () => {
            describe('basic tests', () => {
                let rewardsToken: TokenWithAddress;

                beforeEach(async () => {
                    rewardsToken = await createTestToken();

                    await prepareSimplePool(
                        new TokenData(TokenSymbol.TKN),
                        new TokenData(TokenSymbol.TKN),
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    );
                });

                it('should revert when attempting to leave a non-existing program', async () => {
                    await expect(standardRewards.connect(provider).leave(0, 1)).to.be.revertedWith('DoesNotExist');
                });

                it('should revert when attempting to leave with an invalid amount', async () => {
                    await expect(standardRewards.connect(provider).leave(1, 0)).to.be.revertedWith('ZeroValue');
                });
            });

            const testLeave = (poolSymbol: TokenSymbol, rewardsSymbol: TokenSymbol) => {
                const poolData = new TokenData(poolSymbol);
                const rewardsData = new TokenData(rewardsSymbol);
                let pool: TokenWithAddress;
                let rewardsToken: TokenWithAddress;
                let poolToken: IPoolToken;
                let poolTokenAmount: BigNumber;

                beforeEach(async () => {
                    if (rewardsData.isBNT()) {
                        rewardsToken = bnt;
                    } else {
                        rewardsToken = await createToken(new TokenData(rewardsSymbol));
                    }

                    ({ token: pool, poolToken } = await prepareSimplePool(
                        poolData,
                        rewardsData,
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));

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

                        id = await createProgram(
                            standardRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );

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
                        const prevProviderRewardsTokenBalance = await getBalance(rewardsToken, provider);
                        const prevStandardRewardsBalance = await poolToken.balanceOf(standardRewards.address);
                        const prevRewardsTokenBalance = await getBalance(rewardsToken, standardRewards);

                        const res = await standardRewards.connect(provider).leave(id, amount);

                        let transactionCost = BigNumber.from(0);
                        if (rewardsData.isNative()) {
                            transactionCost = await getTransactionCost(res);
                        }

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
                        expect(await getBalance(rewardsToken, provider)).to.equal(
                            prevProviderRewardsTokenBalance.sub(transactionCost)
                        );
                        expect(await poolToken.balanceOf(standardRewards.address)).to.equal(
                            prevStandardRewardsBalance.sub(amount)
                        );
                        expect(await getBalance(rewardsToken, standardRewards)).to.equal(prevRewardsTokenBalance);
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

                    context('when the active program was disabled', () => {
                        beforeEach(async () => {
                            await standardRewards.enableProgram(id, false);
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
                for (const rewardsSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                    context(`${poolSymbol} pool with ${rewardsSymbol} rewards`, () => {
                        testLeave(poolSymbol, rewardsSymbol);
                    });
                }
            }
        });

        describe('depositing and joining', () => {
            describe('basic tests', () => {
                let pool: TokenWithAddress;
                let nativePool: TokenWithAddress;
                let rewardsToken: TokenWithAddress;
                let tokenAmount: BigNumber;

                let id: BigNumber;
                let nativeId: BigNumber;

                beforeEach(async () => {
                    const startTime = now;
                    const endTime = now + duration.weeks(12);

                    rewardsToken = await createTestToken();

                    ({ token: pool } = await prepareSimplePool(
                        new TokenData(TokenSymbol.TKN),
                        new TokenData(TokenSymbol.TKN),
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));

                    tokenAmount = DEPOSIT_AMOUNT.div(2);
                    await transfer(deployer, pool, provider, DEPOSIT_AMOUNT);

                    id = await createProgram(standardRewards, pool, rewardsToken, TOTAL_REWARDS, startTime, endTime);

                    ({ token: nativePool } = await prepareSimplePool(
                        new TokenData(TokenSymbol.ETH),
                        new TokenData(TokenSymbol.TKN),
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));

                    nativeId = await createProgram(
                        standardRewards,
                        nativePool,
                        rewardsToken,
                        TOTAL_REWARDS,
                        startTime,
                        endTime
                    );
                });

                const testBasicTests = (permitted: boolean) => {
                    interface Overrides {
                        value?: BigNumber;
                    }

                    const depositAndJoin = async (
                        id: BigNumberish,
                        amount: BigNumberish,
                        overrides: Overrides = {}
                    ) => {
                        if (!permitted) {
                            let { value } = overrides;

                            const [program] = await standardRewards.programs([id]);

                            if (program.pool === nativePool.address) {
                                value ||= BigNumber.from(amount);
                            } else {
                                const token = await Contracts.TestERC20Token.attach(pool.address);
                                await token.connect(provider).approve(standardRewards.address, amount);
                            }

                            return standardRewards.connect(provider).depositAndJoin(id, amount, { value });
                        }

                        const signature = await permitSignature(
                            provider,
                            pool.address,
                            standardRewards,
                            bnt,
                            amount,
                            MAX_UINT256
                        );

                        return standardRewards
                            .connect(provider)
                            .depositAndJoinPermitted(id, amount, MAX_UINT256, signature.v, signature.r, signature.s);
                    };

                    it('should revert when attempting to deposit and join a non-existing program', async () => {
                        await expect(depositAndJoin(0, 1)).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to deposit and join with an invalid amount', async () => {
                        await expect(depositAndJoin(1, 0)).to.be.revertedWith('ZeroValue');
                    });

                    it('should deposit and join an existing program', async () => {
                        const providerProgramIds = (await standardRewards.providerProgramIds(provider.address)).map(
                            (id) => id.toNumber()
                        );

                        expect(providerProgramIds).not.to.include(id.toNumber());

                        await depositAndJoin(id, tokenAmount);

                        expect(
                            (await standardRewards.providerProgramIds(provider.address)).map((id) => id.toNumber())
                        ).to.include(id.toNumber());
                    });

                    if (!permitted) {
                        context('native token pool', () => {
                            it('should revert when attempting to deposit and join with more than what was actually sent', async () => {
                                const amount = toWei(1);
                                const missingAmount = 1;

                                await expect(
                                    depositAndJoin(nativeId, amount, {
                                        value: amount.sub(missingAmount)
                                    })
                                ).to.be.revertedWith('NativeTokenAmountMismatch');

                                await expect(
                                    depositAndJoin(nativeId, amount, { value: BigNumber.from(0) })
                                ).to.be.revertedWith('NativeTokenAmountMismatch');
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
                                    ).to.be.revertedWith(new TokenData(TokenSymbol.TKN).errors().exceedsAllowance);
                                });
                            });

                            it('should revert when attempting to deposit and join with the native token into a non native token pool', async () => {
                                const amount = toWei(1);

                                await expect(
                                    depositAndJoin(id, amount, { value: BigNumber.from(1) })
                                ).to.be.revertedWith('NativeTokenAmountMismatch');
                            });
                        });
                    }
                };

                for (const permitted of [false, true]) {
                    context(permitted ? 'permitted' : 'regular', () => {
                        testBasicTests(permitted);
                    });
                }
            });

            const testDepositAndJoin = (poolSymbol: TokenSymbol, rewardsSymbol: TokenSymbol) => {
                const poolData = new TokenData(poolSymbol);
                const rewardsData = new TokenData(rewardsSymbol);
                let pool: TokenWithAddress;
                let rewardsToken: TokenWithAddress;
                let poolToken: IPoolToken;
                let tokenAmount: BigNumber;

                beforeEach(async () => {
                    if (rewardsData.isBNT()) {
                        rewardsToken = bnt;
                    } else {
                        rewardsToken = await createToken(new TokenData(rewardsSymbol));
                    }

                    ({ token: pool, poolToken } = await prepareSimplePool(
                        poolData,
                        rewardsData,
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));

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

                        id = await createProgram(
                            standardRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );
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
                            const prevProviderRewardsTokenBalance = await getBalance(rewardsToken, provider.address);
                            const prevStandardRewardsBalance = await poolToken.balanceOf(standardRewards.address);
                            const prevRewardsTokenBalance = await getBalance(rewardsToken, standardRewards.address);

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
                            if (poolData.isNative() || rewardsData.isNative()) {
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
                            expect(await getBalance(rewardsToken, provider.address)).to.equal(
                                prevProviderRewardsTokenBalance
                                    .sub(pool.address === rewardsToken.address ? amount : 0)
                                    .sub(rewardsData.isNative() ? transactionCost : 0)
                            );
                            expect(await poolToken.balanceOf(standardRewards.address)).to.equal(
                                prevStandardRewardsBalance.add(expectedPoolTokenAmount)
                            );
                            expect(await getBalance(rewardsToken, standardRewards.address)).to.equal(
                                prevRewardsTokenBalance
                            );
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

                        context('when the active program was disabled', () => {
                            beforeEach(async () => {
                                await standardRewards.enableProgram(id, false);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).depositAndJoin(id, tokenAmount)
                                ).to.be.revertedWith('ProgramDisabled');
                            });
                        });

                        context('after the active program has ended', () => {
                            beforeEach(async () => {
                                await setTime(standardRewards, endTime + 1);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).depositAndJoin(id, tokenAmount)
                                ).to.be.revertedWith('ProgramInactive');
                            });
                        });

                        context('when the active program was terminated', () => {
                            beforeEach(async () => {
                                await standardRewards.terminateProgram(id);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardRewards.connect(provider).depositAndJoin(id, tokenAmount)
                                ).to.be.revertedWith('ProgramInactive');
                            });
                        });
                    });
                });
            };

            for (const poolSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                for (const rewardsSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                    context(`${poolSymbol} pool with ${rewardsSymbol} rewards`, () => {
                        testDepositAndJoin(poolSymbol, rewardsSymbol);
                    });
                }
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
                externalRewardsVault,
                masterVault,
                poolCollection
            } = await createSystem());

            standardRewards = await createStandardRewards(
                network,
                networkSettings,
                bntGovernance,
                vbnt,
                bntPool,
                externalRewardsVault
            );

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
            rewardsSymbol: TokenSymbol;
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
            rewardsTokenData: TokenData;
            rewardsToken: TokenWithAddress;
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
            const rewardsTokenData = new TokenData(rewardsSpec.rewardsSymbol);

            let rewardsToken: TokenWithAddress;
            if (rewardsTokenData.isBNT()) {
                rewardsToken = bnt;
            } else {
                rewardsToken = await createToken(rewardsTokenData);
            }

            const startTime = now;
            const endTime = startTime + rewardsSpec.duration;

            return {
                rewardsTokenData,
                rewardsToken,
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

            const { token: pool, poolToken } = await prepareSimplePool(
                poolData,
                rewardsData.rewardsTokenData,
                rewardsData.rewardsToken,
                programSpec.initialBalance,
                rewardsData.totalRewards
            );

            const id = await createProgram(
                standardRewards,
                pool,
                rewardsData.rewardsToken,
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

        const setupRewardsPoolData = async (programsData: ProgramData[], rewardsData: RewardsData) => {
            for (const programData of programsData) {
                if (programData.poolData.symbol() === rewardsData.rewardsTokenData.symbol()) {
                    return {
                        poolData: programData.poolData,
                        pool: programData.pool,
                        poolToken: programData.poolToken
                    };
                }
            }

            // create another pool for receiving the reward stakes
            const { token: pool, poolToken } = await setupFundedPool(
                {
                    tokenData: rewardsData.rewardsTokenData,
                    token: rewardsData.rewardsToken,
                    balance: INITIAL_BALANCE,
                    requestedLiquidity: BigNumber.from(INITIAL_BALANCE).mul(1000),
                    bntVirtualBalance: 1,
                    baseTokenVirtualBalance: 2
                },
                deployer,
                network,
                networkInfo,
                networkSettings,
                poolCollection
            );

            return {
                poolData: rewardsData.rewardsTokenData,
                pool,
                poolToken
            };
        };

        describe('claiming/staking', () => {
            const testBasicClaiming = async (programSpec: ProgramSpec, rewardsSpec: RewardsSpec) => {
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
                        await expect(standardRewards.connect(provider).claimRewards([10_000])).to.be.revertedWith(
                            'DoesNotExist'
                        );

                        await expect(
                            standardRewards.connect(provider).claimRewards([programData.id, 10_000])
                        ).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to stake rewards for non-existing programs', async () => {
                        await expect(standardRewards.connect(provider).stakeRewards([10_000])).to.be.revertedWith(
                            'DoesNotExist'
                        );

                        await expect(
                            standardRewards.connect(provider).stakeRewards([programData.id, 10_000])
                        ).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to claim rewards with duplicate ids', async () => {
                        await expect(
                            standardRewards.connect(provider).claimRewards([10_000, 10_000])
                        ).to.be.revertedWith('ArrayNotUnique');

                        await expect(
                            standardRewards.connect(provider).claimRewards([programData.id, programData.id])
                        ).to.be.revertedWith('ArrayNotUnique');
                    });

                    it('should revert when attempting to stake rewards with duplicate ids', async () => {
                        await expect(
                            standardRewards.connect(provider).stakeRewards([10_000, 10_000])
                        ).to.be.revertedWith('ArrayNotUnique');

                        await expect(
                            standardRewards.connect(provider).stakeRewards([programData.id, programData.id])
                        ).to.be.revertedWith('ArrayNotUnique');
                    });

                    context('when the active program was disabled', () => {
                        beforeEach(async () => {
                            await standardRewards.enableProgram(programData.id, false);
                        });

                        it('should revert', async () => {
                            await expect(
                                standardRewards.connect(provider).claimRewards([programData.id])
                            ).to.be.revertedWith('ProgramDisabled');
                        });

                        it('should revert', async () => {
                            await expect(
                                standardRewards.connect(provider).stakeRewards([programData.id])
                            ).to.be.revertedWith('ProgramDisabled');
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
                            ).to.be.revertedWith('RewardsTooHigh');
                        });

                        context('with staked tokens in different rewards program', () => {
                            let rewardsData2: RewardsData;
                            let programData2: ProgramData;

                            beforeEach(async () => {
                                rewardsData2 = await setupRewardsData({
                                    rewardsSymbol: TokenSymbol.TKN1,
                                    totalRewards: toWei(100_00),
                                    duration: duration.weeks(12)
                                });

                                programData2 = await setupProgram(
                                    {
                                        poolSymbol: TokenSymbol.TKN2,
                                        initialBalance: toWei(100_000),
                                        providerStakes: [toWei(10_000), toWei(20_000)]
                                    },
                                    rewardsData2
                                );

                                const amount = toWei(1);
                                await programData2.poolToken.connect(provider).approve(standardRewards.address, amount);
                                return standardRewards.connect(provider).join(programData2.id, amount);
                            });

                            it('should revert if attempting to get pending rewards for programs with different reward tokens', async () => {
                                await expect(
                                    standardRewards.pendingRewards(provider.address, [programData.id, programData2.id])
                                ).to.be.revertedWith('RewardsTokenMismatch');
                            });

                            it('should revert if attempting to claim rewards for programs with different reward tokens', async () => {
                                await expect(
                                    standardRewards.connect(provider).claimRewards([programData.id, programData2.id])
                                ).to.be.revertedWith('RewardsTokenMismatch');
                            });

                            it('should revert if attempting to stake rewards for programs with different reward tokens', async () => {
                                await expect(
                                    standardRewards.connect(provider).stakeRewards([programData.id, programData2.id])
                                ).to.be.revertedWith('RewardsTokenMismatch');
                            });
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
                return `(rewards=${
                    rewardsSpec.rewardsSymbol
                }, totalRewards=${rewardsSpec.totalRewards.toString()}, duration=${humanizeDuration(
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

                        rewardsPoolData = await setupRewardsPoolData(Object.values(programsData), rewardsData);
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
                            const { rewardsTokenData, rewardsToken } = rewardsData;
                            const prevUnclaimedRewards = await standardRewards.unclaimedRewards(rewardsToken.address);

                            const prevProviderBalance = await getBalance(rewardsToken, p);
                            const prevProviderVBNTBalance = await vbnt.balanceOf(p.address);
                            const prevMasterVaultBalance = await getBalance(rewardsToken, masterVault);
                            const prevContractVaultBalance = await getBalance(rewardsToken, standardRewards);
                            const prevBntTotalSupply = await bnt.totalSupply();
                            const prevExternalVaultBalance = await getBalance(
                                rewardsToken,
                                externalRewardsVault.address
                            );

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

                            let transactionCost = BigNumber.from(0);
                            if (rewardsTokenData.isNative()) {
                                transactionCost = await getTransactionCost(res);
                            }

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

                            expect(await standardRewards.unclaimedRewards(rewardsToken.address)).to.equal(
                                prevUnclaimedRewards.sub(totalClaimed)
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
                                expect(await getBalance(rewardsToken, p)).to.equal(
                                    prevProviderBalance.sub(transactionCost)
                                );
                                expect(await vbnt.balanceOf(p.address)).to.equal(
                                    rewardsTokenData.isBNT()
                                        ? prevProviderVBNTBalance.add(poolTokenAmount)
                                        : prevProviderVBNTBalance
                                );

                                // in any case, there shouldn't be any newly minted BNT tokens since either the rewards
                                // token isn't BNT in the first place or all the newly minted tokens should have been
                                // burned again by the BNT pool
                                expect(await bnt.totalSupply()).to.equal(prevBntTotalSupply);

                                if (rewardsTokenData.isBNT()) {
                                    expect(await getBalance(rewardsToken, masterVault)).to.equal(
                                        prevMasterVaultBalance
                                    );
                                    expect(await getBalance(rewardsToken, externalRewardsVault.address)).to.equal(
                                        prevExternalVaultBalance
                                    );
                                } else {
                                    expect(await getBalance(rewardsToken, masterVault)).to.equal(
                                        prevMasterVaultBalance.add(claimedProgram.add(claimedProgram2))
                                    );
                                    expect(await getBalance(rewardsToken, externalRewardsVault.address)).to.equal(
                                        prevExternalVaultBalance.sub(totalClaimed)
                                    );
                                }
                            } else {
                                expect(poolTokenAmount).to.equal(0);
                                expect(await rewardsPoolData.poolToken.balanceOf(p.address)).to.equal(
                                    prevProviderRewardsPoolTokenBalance
                                );

                                expect(await getBalance(rewardsToken, p)).to.equal(
                                    prevProviderBalance.add(totalClaimed).sub(transactionCost)
                                );
                                expect(await getBalance(rewardsToken, masterVault)).to.equal(prevMasterVaultBalance);
                                expect(await vbnt.balanceOf(p.address)).to.equal(prevProviderVBNTBalance);

                                if (rewardsTokenData.isBNT()) {
                                    expect(await bnt.totalSupply()).to.equal(prevBntTotalSupply.add(totalClaimed));
                                    expect(await getBalance(rewardsToken, externalRewardsVault.address)).to.equal(
                                        prevExternalVaultBalance
                                    );
                                } else {
                                    expect(await bnt.totalSupply()).to.equal(prevBntTotalSupply);
                                    expect(await getBalance(rewardsToken, externalRewardsVault.address)).to.equal(
                                        prevExternalVaultBalance.sub(totalClaimed)
                                    );
                                }
                            }

                            expect(await getBalance(rewardsToken, standardRewards)).to.equal(prevContractVaultBalance);
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
                for (const rewardsSymbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                    context(`${poolSymbol} pool with ${rewardsSymbol} rewards`, () => {
                        testBasicClaiming(
                            {
                                poolSymbol,
                                initialBalance: toWei(100_000),
                                providerStakes: [toWei(10_000), toWei(20_000)]
                            },
                            {
                                rewardsSymbol,
                                duration: duration.weeks(12),
                                totalRewards: toWei(50_000)
                            }
                        );

                        for (const poolSymbol2 of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                            if (poolSymbol === poolSymbol2) {
                                continue;
                            }

                            context(`and ${poolSymbol2} pool with ${rewardsSymbol} rewards`, () => {
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
                                                            rewardsSymbol,
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
            }
        });
    });
});
