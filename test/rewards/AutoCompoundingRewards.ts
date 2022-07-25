import Contracts, {
    BancorNetworkInfo,
    ExternalRewardsVault,
    IERC20,
    IVault,
    NetworkSettings,
    PoolToken,
    TestAutoCompoundingRewards,
    TestBancorNetwork,
    TestBNTPool,
    TestPoolCollection,
    TestRewardsMath
} from '../../components/Contracts';
import { ProgramDataStructOutput } from '../../typechain-types/contracts/helpers/TestAutoCompoundingRewards';
import {
    AUTO_PROCESS_MAX_PROGRAMS_FACTOR,
    AUTO_PROCESS_REWARDS_MIN_TIME_DELTA,
    DEFAULT_AUTO_PROCESS_REWARDS_COUNT,
    EXP2_INPUT_TOO_HIGH,
    PPM_RESOLUTION,
    RewardsDistributionType,
    SUPPLY_BURN_TERMINATION_THRESHOLD_PPM,
    ZERO_ADDRESS
} from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { Addressable, max, toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import {
    createAutoCompoundingRewards,
    createSystem,
    createTestToken,
    depositToPool,
    setupFundedPool,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { transfer } from '../helpers/Utils';
import { Relation } from '../matchers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import humanizeDuration from 'humanize-duration';

describe('AutoCompoundingRewards', () => {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let rewardsProvider: SignerWithAddress;

    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let networkSettings: NetworkSettings;
    let bntPool: TestBNTPool;
    let bntPoolToken: PoolToken;
    let bnt: IERC20;
    let poolCollection: TestPoolCollection;
    let externalRewardsVault: ExternalRewardsVault;

    let autoCompoundingRewards: TestAutoCompoundingRewards;

    shouldHaveGap('AutoCompoundingRewards', '_programs');

    before(async () => {
        [deployer, user, rewardsProvider] = await ethers.getSigners();
    });

    beforeEach(async () => {
        ({ network, networkInfo, networkSettings, bnt, bntPool, bntPoolToken, poolCollection, externalRewardsVault } =
            await createSystem());
    });

    const prepareSimplePool = async (tokenData: TokenData, providerStake: BigNumberish, totalRewards: BigNumberish) => {
        // deposit initial stake so that the participating user would have some initial amount of pool tokens
        const { token, poolToken } = await setupFundedPool(
            {
                tokenData,
                balance: providerStake,
                requestedFunding: tokenData.isBNT() ? max(providerStake, totalRewards).mul(1000) : 0,
                bntVirtualBalance: 1,
                baseTokenVirtualBalance: 2
            },
            user,
            network,
            networkInfo,
            networkSettings,
            poolCollection
        );

        // if we're rewarding BNT - no additional funding is needed
        if (!tokenData.isBNT()) {
            // deposit pool tokens as staking rewards
            await depositToPool(rewardsProvider, token, totalRewards, network);

            await transfer(
                rewardsProvider,
                poolToken,
                externalRewardsVault,
                await poolToken.balanceOf(rewardsProvider.address)
            );
        }

        return { token, poolToken };
    };

    const getRewards = async (
        program: ProgramDataStructOutput,
        token: TokenWithAddress,
        rewardsMath: TestRewardsMath,
        tokenData: TokenData,
        rewardsVault: IVault
    ) => {
        const currTime = await autoCompoundingRewards.currentTime();
        const prevTime = Math.max(program.prevDistributionTimestamp, program.startTime);

        if (program.isPaused || program.startTime > currTime) {
            return {
                tokenAmountToDistribute: BigNumber.from(0),
                poolTokenAmountToBurn: BigNumber.from(0)
            };
        }

        let currTimeElapsed: number;
        let prevTimeElapsed: number;
        let tokenAmountToDistribute: BigNumber;

        switch (program.distributionType) {
            case RewardsDistributionType.Flat:
                currTimeElapsed = Math.min(currTime, program.endTime) - program.startTime;
                prevTimeElapsed = Math.min(prevTime, program.endTime) - program.startTime;
                tokenAmountToDistribute = await rewardsMath.calcFlatRewards(
                    program.totalRewards,
                    currTimeElapsed - prevTimeElapsed,
                    program.endTime - program.startTime
                );

                break;

            case RewardsDistributionType.ExpDecay:
                currTimeElapsed = currTime - program.startTime;
                prevTimeElapsed = prevTime - program.startTime;
                tokenAmountToDistribute = (
                    await rewardsMath.calcExpDecayRewards(program.totalRewards, currTimeElapsed, program.halfLife)
                ).sub(await rewardsMath.calcExpDecayRewards(program.totalRewards, prevTimeElapsed, program.halfLife));

                break;

            default:
                throw new Error(`Unsupported type ${program.distributionType}`);
        }

        let poolToken: PoolToken;
        let stakedBalance: BigNumber;
        if (tokenData.isBNT()) {
            poolToken = bntPoolToken;
            stakedBalance = await bntPool.stakedBalance();
        } else {
            poolToken = await Contracts.PoolToken.attach(await poolCollection.poolToken(token.address));
            ({ stakedBalance } = await poolCollection.poolLiquidity(token.address));
        }

        const protocolPoolTokenAmount = await poolToken.balanceOf(rewardsVault.address);

        const poolTokenSupply = await poolToken.totalSupply();
        const val = tokenAmountToDistribute.mul(poolTokenSupply);

        const poolTokenAmountToBurn = val
            .mul(poolTokenSupply)
            .div(val.add(stakedBalance.mul(poolTokenSupply.sub(protocolPoolTokenAmount))));

        return { tokenAmountToDistribute, poolTokenAmountToBurn };
    };

    const START_TIME = 1000;
    const FLAT_TOTAL_DURATION = duration.days(10);
    const EXP_DECAY_HALF_LIFE = duration.days(560);
    const EXP_DECAY_MAX_DURATION = EXP2_INPUT_TOO_HIGH.mul(EXP_DECAY_HALF_LIFE).sub(1).ceil().toNumber();

    const programEndTimes = {
        [RewardsDistributionType.Flat]: START_TIME + FLAT_TOTAL_DURATION,
        [RewardsDistributionType.ExpDecay]: 0
    };

    const programHalfLives = {
        [RewardsDistributionType.Flat]: 0,
        [RewardsDistributionType.ExpDecay]: EXP_DECAY_HALF_LIFE
    };

    const programDurations = {
        [RewardsDistributionType.Flat]: FLAT_TOTAL_DURATION,
        [RewardsDistributionType.ExpDecay]: EXP_DECAY_MAX_DURATION
    };

    const createProgram = async (
        distributionType: RewardsDistributionType,
        autoCompoundingRewards: TestAutoCompoundingRewards,
        pool: string,
        totalRewards: BigNumberish,
        startTime: number
    ) => {
        switch (distributionType) {
            case RewardsDistributionType.Flat:
                return autoCompoundingRewards.createFlatProgram(
                    pool,
                    totalRewards,
                    startTime,
                    programEndTimes[distributionType]
                );

            case RewardsDistributionType.ExpDecay:
                return autoCompoundingRewards.createExpDecayProgram(
                    pool,
                    totalRewards,
                    startTime,
                    programHalfLives[distributionType]
                );
        }
    };

    describe('construction', () => {
        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.AutoCompoundingRewards.deploy(
                    ZERO_ADDRESS,
                    networkSettings.address,
                    bnt.address,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.AutoCompoundingRewards.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    bnt.address,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT contract', async () => {
            await expect(
                Contracts.AutoCompoundingRewards.deploy(
                    network.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT pool contract', async () => {
            await expect(
                Contracts.AutoCompoundingRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bnt.address,
                    ZERO_ADDRESS,
                    externalRewardsVault.address
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external rewards contract', async () => {
            await expect(
                Contracts.AutoCompoundingRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bnt.address,
                    bntPool.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWithError('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            const autoCompoundingRewards = await createAutoCompoundingRewards(
                network,
                networkSettings,
                bnt,
                bntPool,
                externalRewardsVault
            );

            await expect(autoCompoundingRewards.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const autoCompoundingRewards = await createAutoCompoundingRewards(
                network,
                networkSettings,
                bnt,
                bntPool,
                externalRewardsVault
            );

            expect(await autoCompoundingRewards.version()).to.equal(1);

            await expectRoles(autoCompoundingRewards, Roles.Upgradeable);

            await expectRole(autoCompoundingRewards, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);

            expect(await autoCompoundingRewards.autoProcessRewardsCount()).to.equal(DEFAULT_AUTO_PROCESS_REWARDS_COUNT);
            expect(await autoCompoundingRewards.autoProcessRewardsIndex()).to.equal(0);
        });

        it('should emit events on initialization', async () => {
            const autoCompoundingRewards = await Contracts.AutoCompoundingRewards.deploy(
                network.address,
                networkSettings.address,
                bnt.address,
                bntPool.address,
                externalRewardsVault.address
            );
            const res = await autoCompoundingRewards.initialize();
            await expect(res)
                .to.emit(autoCompoundingRewards, 'AutoProcessRewardsCountUpdated')
                .withArgs(0, DEFAULT_AUTO_PROCESS_REWARDS_COUNT);
        });
    });

    describe('management', () => {
        const MIN_LIQUIDITY_FOR_TRADING = toWei(1_000);
        const TOTAL_REWARDS = toWei(10_000);
        const INITIAL_USER_STAKE = toWei(50_000);

        beforeEach(async () => {
            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const testProgramManagement = (distributionType: RewardsDistributionType) => {
            beforeEach(async () => {
                autoCompoundingRewards = await createAutoCompoundingRewards(
                    network,
                    networkSettings,
                    bnt,
                    bntPool,
                    externalRewardsVault
                );
            });

            context('basic tests', () => {
                let token: TokenWithAddress;
                let poolToken: TokenWithAddress;

                beforeEach(async () => {
                    ({ token, poolToken } = await prepareSimplePool(
                        new TokenData(TokenSymbol.TKN),
                        INITIAL_USER_STAKE,
                        TOTAL_REWARDS
                    ));
                });

                describe('creation', () => {
                    it('should revert when a non-admin attempts to create a program', async () => {
                        await expect(
                            createProgram(
                                distributionType,
                                autoCompoundingRewards.connect(user),
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            )
                        ).to.be.revertedWithError('AccessDenied');
                    });

                    it('should revert when the reserve token is invalid', async () => {
                        await expect(
                            createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                ZERO_ADDRESS,
                                TOTAL_REWARDS,
                                START_TIME
                            )
                        ).to.revertedWithError('InvalidAddress');
                    });

                    it('should revert when the program already exists', async () => {
                        await createProgram(
                            distributionType,
                            autoCompoundingRewards,
                            token.address,
                            TOTAL_REWARDS,
                            START_TIME
                        );

                        await expect(
                            createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            )
                        ).to.revertedWithError('AlreadyExists');
                    });

                    it('should revert when the total rewards are equal to 0', async () => {
                        await expect(
                            createProgram(distributionType, autoCompoundingRewards, token.address, 0, START_TIME)
                        ).to.revertedWithError('ZeroValue');
                    });

                    it('should revert when the pool is not whitelisted', async () => {
                        const nonWhitelistedToken = await createTestToken();

                        await expect(
                            createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                nonWhitelistedToken.address,
                                TOTAL_REWARDS,
                                START_TIME
                            )
                        ).to.revertedWithError('NotWhitelisted');
                    });

                    switch (distributionType) {
                        case RewardsDistributionType.Flat:
                            for (let startTime = 0; startTime < 4; startTime++) {
                                for (let endTime = 0; endTime < 4; endTime++) {
                                    for (let currTime = 0; currTime < 4; currTime++) {
                                        context(
                                            `[startTime, endTime, currTime] = ${[startTime, endTime, currTime]}`,
                                            () => {
                                                beforeEach(async () => {
                                                    await autoCompoundingRewards.setTime(currTime);
                                                });

                                                if (currTime <= startTime && startTime < endTime) {
                                                    it(`should complete`, async () => {
                                                        const poolsBefore = await autoCompoundingRewards.pools();
                                                        expect(poolsBefore).to.not.include(token.address);

                                                        const res = await autoCompoundingRewards.createFlatProgram(
                                                            token.address,
                                                            TOTAL_REWARDS,
                                                            startTime,
                                                            endTime
                                                        );

                                                        const poolsAfter = await autoCompoundingRewards.pools();
                                                        expect(poolsAfter).to.include(token.address);

                                                        await expect(res)
                                                            .to.emit(autoCompoundingRewards, 'FlatProgramCreated')
                                                            .withArgs(token.address, TOTAL_REWARDS, startTime, endTime);

                                                        const program = await autoCompoundingRewards.program(
                                                            token.address
                                                        );

                                                        expect(program.poolToken).to.equal(poolToken.address);
                                                        expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                                                        expect(program.remainingRewards).to.equal(TOTAL_REWARDS);
                                                        expect(program.distributionType).to.equal(distributionType);
                                                        expect(program.startTime).to.equal(startTime);
                                                        expect(program.endTime).to.equal(endTime);
                                                        expect(program.halfLife).to.equal(0);
                                                        expect(program.prevDistributionTimestamp).to.equal(0);
                                                        expect(program.isPaused).to.be.false;
                                                    });
                                                } else {
                                                    it(`should revert`, async () => {
                                                        const poolsBefore = await autoCompoundingRewards.pools();
                                                        expect(poolsBefore).to.not.include(token.address);

                                                        await expect(
                                                            autoCompoundingRewards.createFlatProgram(
                                                                token.address,
                                                                TOTAL_REWARDS,
                                                                startTime,
                                                                endTime
                                                            )
                                                        ).to.be.revertedWithError('InvalidParam');
                                                    });
                                                }
                                            }
                                        );
                                    }
                                }
                            }
                            break;

                        case RewardsDistributionType.ExpDecay:
                            for (let startTime = 0; startTime < 4; startTime++) {
                                for (let halfLife = 0; halfLife < 4; halfLife++) {
                                    for (let currTime = 0; currTime < 4; currTime++) {
                                        context(
                                            `[startTime, halfLife, currTime] = ${[startTime, halfLife, currTime]}`,
                                            () => {
                                                beforeEach(async () => {
                                                    await autoCompoundingRewards.setTime(currTime);
                                                });

                                                if (currTime <= startTime && halfLife !== 0) {
                                                    it(`should complete`, async () => {
                                                        const poolsBefore = await autoCompoundingRewards.pools();
                                                        expect(poolsBefore).to.not.include(token.address);

                                                        const res = await autoCompoundingRewards.createExpDecayProgram(
                                                            token.address,
                                                            TOTAL_REWARDS,
                                                            startTime,
                                                            halfLife
                                                        );

                                                        const poolsAfter = await autoCompoundingRewards.pools();
                                                        expect(poolsAfter).to.include(token.address);

                                                        await expect(res)
                                                            .to.emit(autoCompoundingRewards, 'ExpDecayProgramCreated')
                                                            .withArgs(
                                                                token.address,
                                                                TOTAL_REWARDS,
                                                                startTime,
                                                                halfLife
                                                            );

                                                        const program = await autoCompoundingRewards.program(
                                                            token.address
                                                        );

                                                        expect(program.poolToken).to.equal(poolToken.address);
                                                        expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                                                        expect(program.remainingRewards).to.equal(TOTAL_REWARDS);
                                                        expect(program.distributionType).to.equal(distributionType);
                                                        expect(program.startTime).to.equal(startTime);
                                                        expect(program.endTime).to.equal(0);
                                                        expect(program.halfLife).to.equal(halfLife);
                                                        expect(program.prevDistributionTimestamp).to.equal(0);
                                                        expect(program.isPaused).to.be.false;
                                                    });
                                                } else {
                                                    it(`should revert`, async () => {
                                                        const poolsBefore = await autoCompoundingRewards.pools();
                                                        expect(poolsBefore).to.not.include(token.address);

                                                        await expect(
                                                            autoCompoundingRewards.createExpDecayProgram(
                                                                token.address,
                                                                TOTAL_REWARDS,
                                                                startTime,
                                                                halfLife
                                                            )
                                                        ).to.be.revertedWithError('InvalidParam');
                                                    });
                                                }
                                            }
                                        );
                                    }
                                }
                            }
                            break;
                    }
                });

                describe('termination', () => {
                    it('should revert when a non-admin attempts to terminate a program', async () => {
                        await expect(
                            autoCompoundingRewards.connect(user).terminateProgram(token.address)
                        ).to.be.revertedWithError('AccessDenied');
                    });

                    context('when a program does not exist', () => {
                        it('should revert', async () => {
                            await expect(autoCompoundingRewards.terminateProgram(token.address)).to.revertedWithError(
                                'DoesNotExist'
                            );
                        });
                    });

                    context('when a program is already created', () => {
                        beforeEach(async () => {
                            await createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            );
                        });

                        it('should terminate a program which has not yet started', async () => {
                            const poolsBefore = await autoCompoundingRewards.pools();
                            expect(poolsBefore).to.include(token.address);

                            const res = await autoCompoundingRewards.terminateProgram(token.address);

                            const poolsAfter = await autoCompoundingRewards.pools();
                            expect(poolsAfter).to.not.include(token.address);

                            await expect(res)
                                .to.emit(autoCompoundingRewards, 'ProgramTerminated')
                                .withArgs(token.address, programEndTimes[distributionType], TOTAL_REWARDS);

                            const program = await autoCompoundingRewards.program(token.address);

                            expect(program.poolToken).to.equal(ZERO_ADDRESS);
                            expect(program.totalRewards).to.equal(0);
                            expect(program.remainingRewards).to.equal(0);
                            expect(program.distributionType).to.equal(0);
                            expect(program.startTime).to.equal(0);
                            expect(program.endTime).to.equal(0);
                            expect(program.halfLife).to.equal(0);
                            expect(program.prevDistributionTimestamp).to.equal(0);
                            expect(program.isPaused).to.be.false;
                        });

                        it('should terminate a program which has already started', async () => {
                            await autoCompoundingRewards.setTime(START_TIME);

                            const poolsBefore = await autoCompoundingRewards.pools();
                            expect(poolsBefore).to.include(token.address);

                            const res = await autoCompoundingRewards.terminateProgram(token.address);

                            const poolsAfter = await autoCompoundingRewards.pools();
                            expect(poolsAfter).to.not.include(token.address);

                            await expect(res)
                                .to.emit(autoCompoundingRewards, 'ProgramTerminated')
                                .withArgs(token.address, programEndTimes[distributionType], TOTAL_REWARDS);

                            const program = await autoCompoundingRewards.program(token.address);

                            expect(program.poolToken).to.equal(ZERO_ADDRESS);
                            expect(program.totalRewards).to.equal(0);
                            expect(program.remainingRewards).to.equal(0);
                            expect(program.distributionType).to.equal(0);
                            expect(program.startTime).to.equal(0);
                            expect(program.endTime).to.equal(0);
                            expect(program.halfLife).to.equal(0);
                            expect(program.prevDistributionTimestamp).to.equal(0);
                            expect(program.isPaused).to.be.false;
                        });
                    });
                });

                describe('pausing / unpausing', () => {
                    beforeEach(async () => {
                        await createProgram(
                            distributionType,
                            autoCompoundingRewards,
                            token.address,
                            TOTAL_REWARDS,
                            START_TIME
                        );
                    });

                    it('should revert when a non-admin attempts to pause/unpause a program', async () => {
                        await expect(
                            autoCompoundingRewards.connect(user).pauseProgram(token.address, true)
                        ).to.be.revertedWithError('AccessDenied');
                    });

                    it('should revert when attempting to pause/unpause a non-existing program', async () => {
                        const newToken = await createTestToken();

                        await expect(
                            autoCompoundingRewards.pauseProgram(newToken.address, true)
                        ).to.be.revertedWithError('DoesNotExist');
                        await expect(
                            autoCompoundingRewards.pauseProgram(newToken.address, false)
                        ).to.be.revertedWithError('DoesNotExist');
                    });

                    it('should pause/resume a program', async () => {
                        expect(await autoCompoundingRewards.isProgramPaused(token.address)).to.be.false;

                        const res = await autoCompoundingRewards.pauseProgram(token.address, true);
                        await expect(res)
                            .to.emit(autoCompoundingRewards, 'ProgramPaused')
                            .withArgs(token.address, true);

                        expect(await autoCompoundingRewards.isProgramPaused(token.address)).to.be.true;

                        const res2 = await autoCompoundingRewards.pauseProgram(token.address, false);
                        await expect(res2)
                            .to.emit(autoCompoundingRewards, 'ProgramPaused')
                            .withArgs(token.address, false);

                        expect(await autoCompoundingRewards.isProgramPaused(token.address)).to.be.false;
                    });

                    it('should ignore updating to the same status', async () => {
                        expect(await autoCompoundingRewards.isProgramPaused(token.address)).to.be.false;

                        await expect(autoCompoundingRewards.pauseProgram(token.address, false)).not.to.emit(
                            autoCompoundingRewards,
                            'ProgramPaused'
                        );

                        await autoCompoundingRewards.pauseProgram(token.address, true);

                        expect(await autoCompoundingRewards.isProgramPaused(token.address)).to.be.true;

                        await expect(autoCompoundingRewards.pauseProgram(token.address, true)).not.to.emit(
                            autoCompoundingRewards,
                            'ProgramPaused'
                        );
                    });
                });

                describe('setting the auto-process count', () => {
                    it('should revert when the new value is zero', async () => {
                        await expect(autoCompoundingRewards.setAutoProcessRewardsCount(0)).to.be.revertedWith(
                            'ZeroValue'
                        );
                    });

                    it('should revert when executed by a non-admin', async () => {
                        const prevAutoProcessRewardsCount = await autoCompoundingRewards.autoProcessRewardsCount();
                        const newAutoProcessRewardsCount = prevAutoProcessRewardsCount.add(1);

                        await expect(
                            autoCompoundingRewards.connect(user).setAutoProcessRewardsCount(newAutoProcessRewardsCount)
                        ).to.be.revertedWith('AccessDenied');
                    });

                    it('should complete when executed by the admin with a value larger than zero', async () => {
                        const prevAutoProcessRewardsCount = await autoCompoundingRewards.autoProcessRewardsCount();
                        const newAutoProcessRewardsCount = prevAutoProcessRewardsCount.add(1);

                        const res1 = await autoCompoundingRewards.setAutoProcessRewardsCount(
                            newAutoProcessRewardsCount
                        );

                        await expect(res1)
                            .to.emit(autoCompoundingRewards, 'AutoProcessRewardsCountUpdated')
                            .withArgs(prevAutoProcessRewardsCount, newAutoProcessRewardsCount);
                        expect(await autoCompoundingRewards.autoProcessRewardsCount()).to.equal(
                            newAutoProcessRewardsCount
                        );

                        const res2 = await autoCompoundingRewards.setAutoProcessRewardsCount(
                            newAutoProcessRewardsCount
                        );

                        await expect(res2).not.to.emit(autoCompoundingRewards, 'AutoProcessRewardsCountUpdated');
                        expect(await autoCompoundingRewards.autoProcessRewardsCount()).to.equal(
                            newAutoProcessRewardsCount
                        );
                    });
                });

                describe('processing rewards', () => {
                    beforeEach(async () => {
                        await createProgram(
                            distributionType,
                            autoCompoundingRewards,
                            token.address,
                            TOTAL_REWARDS,
                            START_TIME
                        );
                    });

                    it('should distribute tokens only when the program is running', async () => {
                        await autoCompoundingRewards.setTime(START_TIME + programDurations[distributionType]);
                        await autoCompoundingRewards.pauseProgram(token.address, true);
                        const res1 = await autoCompoundingRewards.processRewards(token.address);
                        await expect(res1).not.to.emit(autoCompoundingRewards, 'RewardsDistributed');
                        await autoCompoundingRewards.pauseProgram(token.address, false);
                        const res2 = await autoCompoundingRewards.processRewards(token.address);
                        await expect(res2).to.emit(autoCompoundingRewards, 'RewardsDistributed');
                    });

                    if (distributionType === RewardsDistributionType.Flat) {
                        for (const seconds of [
                            Math.floor(START_TIME + FLAT_TOTAL_DURATION / 2),
                            START_TIME + FLAT_TOTAL_DURATION,
                            START_TIME + FLAT_TOTAL_DURATION * 2
                        ]) {
                            it(`should distribute tokens after ${seconds} seconds`, async () => {
                                await autoCompoundingRewards.setTime(seconds);

                                // distribute tokens
                                const res1 = await autoCompoundingRewards.processRewards(token.address);
                                await expect(res1).to.emit(autoCompoundingRewards, 'RewardsDistributed');
                                await autoCompoundingRewards.setTime(START_TIME + FLAT_TOTAL_DURATION * 2);

                                // distribute tokens possibly one last time
                                const res2 = await autoCompoundingRewards.processRewards(token.address);
                                if (seconds < START_TIME + FLAT_TOTAL_DURATION) {
                                    await expect(res2).to.emit(autoCompoundingRewards, 'RewardsDistributed');
                                    await autoCompoundingRewards.setTime(START_TIME + FLAT_TOTAL_DURATION * 4);

                                    // distribute tokens one last time
                                    const res3 = await autoCompoundingRewards.processRewards(token.address);
                                    await expect(res3).not.to.emit(autoCompoundingRewards, 'RewardsDistributed');
                                } else {
                                    await expect(res2).not.to.emit(autoCompoundingRewards, 'RewardsDistributed');
                                }
                            });
                        }
                    }
                });

                describe('is program active', () => {
                    context('before a program has been created', () => {
                        it('should return false', async () => {
                            expect(await autoCompoundingRewards.isProgramActive(token.address)).to.be.false;
                        });
                    });

                    interface TimeSpec {
                        startTime: number;
                        creationTime: number;
                        elapsedTime: number;
                    }

                    interface FlatProgramTimeSpec extends TimeSpec {
                        endTime: number;
                    }

                    interface ExpDecayProgramTimeSpec extends TimeSpec {
                        halfLife: number;
                    }

                    const testProgramActive = (spec: FlatProgramTimeSpec | ExpDecayProgramTimeSpec) => {
                        const { startTime, creationTime, elapsedTime } = spec;

                        switch (distributionType) {
                            case RewardsDistributionType.Flat: {
                                const { endTime } = spec as FlatProgramTimeSpec;
                                const currTime = creationTime + elapsedTime;
                                const isProgramTimingValid = creationTime <= startTime && startTime < endTime;
                                if (!isProgramTimingValid) {
                                    return;
                                }

                                const isProgramTimingActive = startTime <= currTime && currTime <= endTime;

                                context(
                                    `[startTime, endTime, creationTime, elapsedTime] = ${[
                                        startTime,
                                        endTime,
                                        creationTime,
                                        elapsedTime
                                    ]}`,
                                    () => {
                                        beforeEach(async () => {
                                            await autoCompoundingRewards.setTime(creationTime);

                                            await autoCompoundingRewards.createFlatProgram(
                                                token.address,
                                                TOTAL_REWARDS,
                                                startTime,
                                                endTime
                                            );

                                            await autoCompoundingRewards.setTime(currTime);
                                        });

                                        it(`should return ${isProgramTimingActive}`, async () => {
                                            expect(
                                                await autoCompoundingRewards.isProgramActive(token.address)
                                            ).to.equal(isProgramTimingActive);
                                        });
                                    }
                                );

                                break;
                            }

                            case RewardsDistributionType.ExpDecay: {
                                const { halfLife } = spec as ExpDecayProgramTimeSpec;
                                const currTime = creationTime + elapsedTime;

                                const isProgramTimingValid = creationTime <= startTime && halfLife !== 0;
                                if (!isProgramTimingValid) {
                                    return;
                                }

                                const isProgramTimingActive = startTime <= currTime;

                                context(
                                    `[startTime, halfLife, creationTime, elapsedTime] = ${[
                                        startTime,
                                        halfLife,
                                        creationTime,
                                        elapsedTime
                                    ]}`,
                                    () => {
                                        beforeEach(async () => {
                                            await autoCompoundingRewards.setTime(creationTime);

                                            await autoCompoundingRewards.createExpDecayProgram(
                                                token.address,
                                                TOTAL_REWARDS,
                                                startTime,
                                                halfLife
                                            );

                                            await autoCompoundingRewards.setTime(currTime);
                                        });

                                        it(`should return ${isProgramTimingActive}`, async () => {
                                            expect(
                                                await autoCompoundingRewards.isProgramActive(token.address)
                                            ).to.equal(isProgramTimingActive);
                                        });
                                    }
                                );
                                break;
                            }
                        }
                    };

                    switch (distributionType) {
                        case RewardsDistributionType.Flat: {
                            describe('regular tests', () => {
                                for (const startTime of [0, 50]) {
                                    for (const elapsedTime of [0, 100, 1000]) {
                                        testProgramActive({
                                            startTime,
                                            endTime: 500,
                                            creationTime: 0,
                                            elapsedTime
                                        });
                                    }
                                }
                            });

                            describe('@stress tests', () => {
                                for (let startTime = 0; startTime < 5; startTime++) {
                                    for (let endTime = 0; endTime < 5; endTime++) {
                                        for (let creationTime = 0; creationTime < 5; creationTime++) {
                                            for (let elapsedTime = 0; elapsedTime < 5; elapsedTime++) {
                                                testProgramActive({
                                                    startTime,
                                                    endTime,
                                                    creationTime,
                                                    elapsedTime
                                                });
                                            }
                                        }
                                    }
                                }
                            });

                            break;
                        }

                        case RewardsDistributionType.ExpDecay: {
                            describe('regular tests', () => {
                                for (const startTime of [0, 50]) {
                                    for (const elapsedTime of [0, 100, 1000]) {
                                        testProgramActive({
                                            startTime,
                                            halfLife: 500,
                                            creationTime: 0,
                                            elapsedTime
                                        });
                                    }
                                }
                            });

                            describe('@stress tests', () => {
                                for (let startTime = 0; startTime < 5; startTime++) {
                                    for (let halfLife = 0; halfLife < 5; halfLife++) {
                                        for (let creationTime = 0; creationTime < 5; creationTime++) {
                                            for (let elapsedTime = 0; elapsedTime < 5; elapsedTime++) {
                                                testProgramActive({
                                                    startTime,
                                                    halfLife,
                                                    creationTime,
                                                    elapsedTime
                                                });
                                            }
                                        }
                                    }
                                }
                            });

                            break;
                        }
                    }

                    context('before a program has started', () => {
                        beforeEach(async () => {
                            await createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            );

                            await autoCompoundingRewards.setTime(START_TIME - 1);
                        });

                        it('should return false', async () => {
                            expect(await autoCompoundingRewards.isProgramActive(token.address)).to.be.false;
                        });
                    });

                    context('after a program has started', () => {
                        beforeEach(async () => {
                            await createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            );

                            await autoCompoundingRewards.setTime(START_TIME);
                        });

                        it('should return true', async () => {
                            expect(await autoCompoundingRewards.isProgramActive(token.address)).to.be.true;
                        });
                    });

                    context('after a program has ended', () => {
                        beforeEach(async () => {
                            await createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            );

                            await autoCompoundingRewards.setTime(START_TIME + programDurations[distributionType] + 1);
                        });

                        switch (distributionType) {
                            case RewardsDistributionType.Flat:
                                it('should return false', async () => {
                                    expect(await autoCompoundingRewards.isProgramActive(token.address)).to.be.false;
                                });
                                break;

                            case RewardsDistributionType.ExpDecay:
                                it('should return true', async () => {
                                    expect(await autoCompoundingRewards.isProgramActive(token.address)).to.be.true;
                                });
                                break;
                        }
                    });
                });

                describe('program data', () => {
                    describe('single program', () => {
                        it('should not return a non existent program', async () => {
                            const program = await autoCompoundingRewards.program(token.address);

                            expect(program.poolToken).to.equal(ZERO_ADDRESS);
                        });

                        it('should return an existing program', async () => {
                            await createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            );

                            const program = await autoCompoundingRewards.program(token.address);

                            expect(program.poolToken).to.equal(poolToken.address);
                        });
                    });

                    describe('multiple programs', () => {
                        let token1: TokenWithAddress;
                        let token2: TokenWithAddress;
                        let poolToken1: TokenWithAddress;
                        let poolToken2: TokenWithAddress;

                        beforeEach(async () => {
                            ({ token: token1, poolToken: poolToken1 } = await prepareSimplePool(
                                new TokenData(TokenSymbol.TKN),
                                INITIAL_USER_STAKE,
                                TOTAL_REWARDS
                            ));

                            ({ token: token2, poolToken: poolToken2 } = await prepareSimplePool(
                                new TokenData(TokenSymbol.TKN),
                                INITIAL_USER_STAKE,
                                TOTAL_REWARDS
                            ));

                            for (const currToken of [token, token1, token2]) {
                                await createProgram(
                                    distributionType,
                                    autoCompoundingRewards,
                                    currToken.address,
                                    TOTAL_REWARDS,
                                    START_TIME
                                );
                            }
                        });

                        it('should return multiple programs', async () => {
                            const programs = await autoCompoundingRewards.programs();

                            expect(programs.length).to.equal(3);
                            expect(programs[0].poolToken).to.equal(poolToken.address);
                            expect(programs[1].poolToken).to.equal(poolToken1.address);
                            expect(programs[2].poolToken).to.equal(poolToken2.address);
                        });
                    });
                });
            });

            const testTokenSpecificProgramManagement = (
                tokenData: TokenData,
                distributionType: RewardsDistributionType
            ) => {
                context('token specific tests', () => {
                    let token: TokenWithAddress;
                    let poolToken: TokenWithAddress;

                    beforeEach(async () => {
                        ({ token, poolToken } = await prepareSimplePool(tokenData, INITIAL_USER_STAKE, TOTAL_REWARDS));
                    });

                    describe('creation', () => {
                        context('with funds in the rewards vault', () => {
                            let maxTotalRewards: BigNumber;

                            beforeEach(async () => {
                                const totalSupply = await (poolToken as PoolToken).totalSupply();
                                const vaultBalance = await (poolToken as PoolToken).balanceOf(
                                    (tokenData.isBNT() ? bntPool : externalRewardsVault).address
                                );
                                const stakedBalance = tokenData.isBNT()
                                    ? await bntPool.stakedBalance()
                                    : (await poolCollection.poolLiquidity(token.address)).stakedBalance;

                                // let `x` denote the granted rewards in token units (BNT or TKN, depending on the request).
                                // let `y` denote the total supply in pool-token units (bnBNT or bnTKN, depending on the request).
                                // let `z` denote the vault balance in pool-token units (bnBNT or bnTKN, depending on the request).
                                // let `w` denote the staked balance in token units (BNT or TKN, depending on the request).
                                // given the values of `y`, `z` and `w`, we want to calculate the maximum possible value of `x`.
                                // in order to grant rewards of `x` tokens, an amount of `floor(xyy/(xy+w(y-z)))` pool tokens is burned.
                                // therefore we want to calculate the maximum possible value of `x` such that `floor(xyy/(xy+w(y-z))) <= z`.
                                // this value can be calculated as `x = ceil(w(y-z)(z+1)/(y(y-z-1)))-1 = floor((w(y-z)(z+1)-1)/(y(y-z-1)))`:
                                maxTotalRewards = stakedBalance
                                    .mul(totalSupply.sub(vaultBalance))
                                    .mul(vaultBalance.add(1))
                                    .sub(1)
                                    .div(totalSupply.mul(totalSupply.sub(vaultBalance).sub(1)));
                            });

                            it('should not revert when the funds are sufficient for backing the total rewards', async () => {
                                const res = await createProgram(
                                    distributionType,
                                    autoCompoundingRewards,
                                    token.address,
                                    maxTotalRewards,
                                    START_TIME
                                );

                                switch (distributionType) {
                                    case RewardsDistributionType.Flat:
                                        await expect(res)
                                            .to.emit(autoCompoundingRewards, 'FlatProgramCreated')
                                            .withArgs(
                                                token.address,
                                                maxTotalRewards,
                                                START_TIME,
                                                programEndTimes[distributionType]
                                            );
                                        break;
                                    case RewardsDistributionType.ExpDecay:
                                        await expect(res)
                                            .to.emit(autoCompoundingRewards, 'ExpDecayProgramCreated')
                                            .withArgs(
                                                token.address,
                                                maxTotalRewards,
                                                START_TIME,
                                                programHalfLives[distributionType]
                                            );
                                        break;
                                }
                            });

                            it('should revert when the funds are not sufficient for backing the total rewards', async () => {
                                await expect(
                                    createProgram(
                                        distributionType,
                                        autoCompoundingRewards,
                                        token.address,
                                        maxTotalRewards.add(1),
                                        START_TIME
                                    )
                                ).to.revertedWithError('InsufficientFunds');
                            });
                        });

                        it('should create the program', async () => {
                            const res = await createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            );

                            switch (distributionType) {
                                case RewardsDistributionType.Flat:
                                    await expect(res)
                                        .to.emit(autoCompoundingRewards, 'FlatProgramCreated')
                                        .withArgs(
                                            token.address,
                                            TOTAL_REWARDS,
                                            START_TIME,
                                            programEndTimes[distributionType]
                                        );
                                    break;
                                case RewardsDistributionType.ExpDecay:
                                    await expect(res)
                                        .to.emit(autoCompoundingRewards, 'ExpDecayProgramCreated')
                                        .withArgs(
                                            token.address,
                                            TOTAL_REWARDS,
                                            START_TIME,
                                            programHalfLives[distributionType]
                                        );
                                    break;
                            }

                            const program = await autoCompoundingRewards.program(token.address);

                            expect(program.poolToken).to.equal(poolToken.address);
                            expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                            expect(program.remainingRewards).to.equal(TOTAL_REWARDS);
                            expect(program.distributionType).to.equal(distributionType);
                            expect(program.startTime).to.equal(START_TIME);
                            expect(program.endTime).to.equal(programEndTimes[distributionType]);
                            expect(program.halfLife).to.equal(programHalfLives[distributionType]);
                            expect(program.prevDistributionTimestamp).to.equal(0);
                            expect(program.isPaused).to.be.false;
                        });
                    });

                    describe('processing rewards', () => {
                        let rewardsVault: IVault;

                        beforeEach(async () => {
                            await createProgram(
                                distributionType,
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                START_TIME
                            );

                            rewardsVault = tokenData.isBNT() ? bntPool : externalRewardsVault;
                        });

                        it('should revert when there are insufficient funds', async () => {
                            if (tokenData.isBNT()) {
                                await bntPool.grantRole(Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, deployer.address);
                            } else {
                                await externalRewardsVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, deployer.address);
                            }

                            await autoCompoundingRewards.setTime(START_TIME + programDurations[distributionType]);

                            const balance = await (poolToken as PoolToken).balanceOf(rewardsVault.address);
                            await rewardsVault.withdrawFunds(poolToken.address, deployer.address, balance.sub(1));

                            await expect(autoCompoundingRewards.processRewards(token.address)).to.be.revertedWithError(
                                'InsufficientFunds'
                            );
                        });
                    });
                });
            };

            for (const symbol of [TokenSymbol.BNT, TokenSymbol.ETH, TokenSymbol.TKN]) {
                context(symbol, () => {
                    testTokenSpecificProgramManagement(new TokenData(symbol), distributionType);
                });
            }
        };

        for (const distributionType of [RewardsDistributionType.Flat, RewardsDistributionType.ExpDecay]) {
            context(distributionType === RewardsDistributionType.Flat ? 'flat' : 'exponential decay', () => {
                testProgramManagement(distributionType);
            });
        }
    });

    describe('process rewards', () => {
        const EXP_DECAY_HALF_LIFE = duration.days(561);
        const EXP_DECAY_MAX_DURATION = EXP2_INPUT_TOO_HIGH.mul(EXP_DECAY_HALF_LIFE).sub(1).ceil().toNumber();

        const testRewards = (
            tokenData: TokenData,
            distributionType: RewardsDistributionType,
            providerStake: BigNumberish,
            totalRewards: BigNumberish
        ) => {
            let rewardsMath: TestRewardsMath;
            let token: TokenWithAddress;
            let poolToken: PoolToken;
            let rewardsVault: IVault;

            const MIN_LIQUIDITY_FOR_TRADING = toWei(1_000);

            beforeEach(async () => {
                rewardsMath = await Contracts.TestRewardsMath.deploy();

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                ({ token, poolToken } = await prepareSimplePool(tokenData, providerStake, totalRewards));

                rewardsVault = tokenData.isBNT() ? bntPool : externalRewardsVault;

                autoCompoundingRewards = await createAutoCompoundingRewards(
                    network,
                    networkSettings,
                    bnt,
                    bntPool,
                    externalRewardsVault
                );
            });

            const getPoolTokenUnderlying = async (user: Addressable) => {
                const userPoolTokenBalance = await poolToken.balanceOf(user.address);

                if (tokenData.isBNT()) {
                    return bntPool.poolTokenToUnderlying(userPoolTokenBalance);
                }

                return poolCollection.poolTokenToUnderlying(token.address, userPoolTokenBalance);
            };

            const testDistribution = async () => {
                const prevProgram = await autoCompoundingRewards.program(token.address);
                const prevPoolTokenBalance = await poolToken.balanceOf(rewardsVault.address);
                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                const prevUserTokenOwned = await getPoolTokenUnderlying(user);
                const prevExternalRewardsVaultTokenOwned = await getPoolTokenUnderlying(rewardsVault);
                const maxBurn = prevPoolTokenTotalSupply.mul(SUPPLY_BURN_TERMINATION_THRESHOLD_PPM).div(PPM_RESOLUTION);

                const { tokenAmountToDistribute, poolTokenAmountToBurn } = await getRewards(
                    prevProgram,
                    token,
                    rewardsMath,
                    tokenData,
                    rewardsVault
                );

                const res = await autoCompoundingRewards.processRewards(token.address);
                const program = await autoCompoundingRewards.program(token.address);

                if (tokenAmountToDistribute.eq(0) || poolTokenAmountToBurn.eq(0)) {
                    await expect(res).not.to.emit(autoCompoundingRewards, 'RewardsDistributed');

                    expect(program.prevDistributionTimestamp).to.equal(prevProgram.prevDistributionTimestamp);
                } else if (poolTokenAmountToBurn.gte(maxBurn)) {
                    await expect(res).not.to.emit(autoCompoundingRewards, 'RewardsDistributed');

                    expect(await poolToken.balanceOf(rewardsVault.address)).to.equal(prevPoolTokenBalance);
                    expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply);
                    expect(await getPoolTokenUnderlying(user)).to.equal(prevUserTokenOwned);
                    expect(await getPoolTokenUnderlying(rewardsVault)).to.equal(prevExternalRewardsVaultTokenOwned);

                    return { tokenAmountToDistribute: BigNumber.from(0) };
                } else {
                    await expect(res)
                        .to.emit(autoCompoundingRewards, 'RewardsDistributed')
                        .withArgs(
                            token.address,
                            tokenAmountToDistribute,
                            poolTokenAmountToBurn,
                            program.remainingRewards
                        );

                    expect(program.prevDistributionTimestamp).to.equal(await autoCompoundingRewards.currentTime());
                }

                expect(program.remainingRewards).to.equal(prevProgram.remainingRewards.sub(tokenAmountToDistribute));
                expect(program.totalRewards).to.equal(prevProgram.totalRewards);

                expect(await poolToken.balanceOf(rewardsVault.address)).to.equal(
                    prevPoolTokenBalance.sub(poolTokenAmountToBurn)
                );
                expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply.sub(poolTokenAmountToBurn));

                const actualUserTokenOwned = await getPoolTokenUnderlying(user);
                const expectedUserTokenOwned = prevUserTokenOwned.add(tokenAmountToDistribute);
                const actualRewardsVaultTokenOwned = await getPoolTokenUnderlying(rewardsVault);
                const expectedRewardsVaultTokenOwned = prevExternalRewardsVaultTokenOwned.sub(tokenAmountToDistribute);

                switch (program.distributionType) {
                    case RewardsDistributionType.Flat:
                        expect(actualUserTokenOwned).to.be.almostEqual(expectedUserTokenOwned, {
                            maxRelativeError: new Decimal('0000000000000000000002'),
                            relation: Relation.LesserOrEqual
                        });
                        expect(actualRewardsVaultTokenOwned).to.be.almostEqual(expectedRewardsVaultTokenOwned, {
                            maxAbsoluteError: new Decimal(1),
                            maxRelativeError: new Decimal('0000000000000000000014'),
                            relation: Relation.GreaterOrEqual
                        });
                        break;

                    case RewardsDistributionType.ExpDecay:
                        expect(actualUserTokenOwned).to.be.almostEqual(expectedUserTokenOwned, {
                            maxRelativeError: new Decimal('0000000000000000000002'),
                            relation: Relation.LesserOrEqual
                        });
                        expect(actualRewardsVaultTokenOwned).to.be.almostEqual(expectedRewardsVaultTokenOwned, {
                            maxRelativeError: new Decimal('00000000000000062'),
                            relation: Relation.GreaterOrEqual
                        });
                        break;

                    default:
                        throw new Error(`Unsupported type ${distributionType}`);
                }

                return { tokenAmountToDistribute };
            };

            const testProgram = (programDuration: number) => {
                context(RewardsDistributionType[distributionType], () => {
                    let startTime: number;

                    beforeEach(async () => {
                        startTime = await latest();

                        if (distributionType === RewardsDistributionType.Flat) {
                            await autoCompoundingRewards.createFlatProgram(
                                token.address,
                                totalRewards,
                                startTime,
                                startTime + programDuration
                            );
                        } else {
                            await autoCompoundingRewards.createExpDecayProgram(
                                token.address,
                                totalRewards,
                                startTime,
                                EXP_DECAY_HALF_LIFE
                            );
                        }
                    });

                    describe('basic tests', () => {
                        context('before the beginning of a program', () => {
                            beforeEach(async () => {
                                await autoCompoundingRewards.setTime(startTime - duration.days(1));
                            });

                            it('should not distribute any rewards', async () => {
                                const { tokenAmountToDistribute } = await testDistribution();
                                expect(tokenAmountToDistribute).to.equal(0);
                            });
                        });

                        context('at the beginning of a program', () => {
                            beforeEach(async () => {
                                await autoCompoundingRewards.setTime(startTime);
                            });

                            it('should not distribute any rewards', async () => {
                                const { tokenAmountToDistribute } = await testDistribution();
                                expect(tokenAmountToDistribute).to.equal(0);
                            });
                        });

                        context('at the end of a program', () => {
                            beforeEach(async () => {
                                await autoCompoundingRewards.setTime(startTime + programDuration);
                            });

                            switch (distributionType) {
                                case RewardsDistributionType.Flat:
                                    it('should distribute all the rewards', async () => {
                                        const { tokenAmountToDistribute } = await testDistribution();
                                        expect(tokenAmountToDistribute).to.equal(totalRewards);
                                    });

                                    break;

                                case RewardsDistributionType.ExpDecay:
                                    it('should distribute almost all the rewards', async () => {
                                        const { tokenAmountToDistribute } = await testDistribution();
                                        expect(tokenAmountToDistribute).to.be.almostEqual(totalRewards, {
                                            maxRelativeError: new Decimal('0.000000113'),
                                            maxAbsoluteError: new Decimal(1),
                                            relation: Relation.LesserOrEqual
                                        });
                                    });

                                    break;

                                default:
                                    throw new Error(`Unsupported type ${distributionType}`);
                            }
                        });

                        context('after the end of a program', () => {
                            beforeEach(async () => {
                                await autoCompoundingRewards.setTime(startTime + programDuration + duration.days(1));
                            });

                            switch (distributionType) {
                                case RewardsDistributionType.Flat:
                                    it('should distribute all the rewards', async () => {
                                        const { tokenAmountToDistribute } = await testDistribution();
                                        expect(tokenAmountToDistribute).to.equal(totalRewards);
                                    });

                                    break;

                                case RewardsDistributionType.ExpDecay:
                                    it('should revert with an overflow', async () => {
                                        await expect(
                                            autoCompoundingRewards.processRewards(token.address)
                                        ).to.be.revertedWithError('Overflow');
                                    });

                                    break;

                                default:
                                    throw new Error(`Unsupported type ${distributionType}`);
                            }
                        });

                        context('while the program is active', () => {
                            beforeEach(async () => {
                                await autoCompoundingRewards.setTime(startTime + Math.floor(programDuration / 2));
                            });

                            it('should distribute rewards', async () => {
                                const { tokenAmountToDistribute } = await testDistribution();
                                expect(tokenAmountToDistribute).to.be.gt(0);
                            });

                            it('should not distribute any rewards if no time has elapsed since the last distribution', async () => {
                                let { tokenAmountToDistribute } = await testDistribution();
                                expect(tokenAmountToDistribute).to.be.gt(0);

                                ({ tokenAmountToDistribute } = await testDistribution());
                                expect(tokenAmountToDistribute).to.equal(0);
                            });

                            context('paused', () => {
                                beforeEach(async () => {
                                    await autoCompoundingRewards.pauseProgram(token.address, true);
                                });

                                it('should not distribute any rewards', async () => {
                                    const { tokenAmountToDistribute } = await testDistribution();
                                    expect(tokenAmountToDistribute).to.equal(0);
                                });
                            });
                        });

                        context('if the burn amount is equal or higher than the total supply threshold', () => {
                            beforeEach(async () => {
                                await autoCompoundingRewards.setTime(startTime + Math.floor(programDuration / 1.1));

                                const program = await autoCompoundingRewards.program(token.address);
                                const poolTokenTotalSupply = await poolToken.totalSupply();
                                const maxBurn = poolTokenTotalSupply
                                    .mul(SUPPLY_BURN_TERMINATION_THRESHOLD_PPM)
                                    .div(PPM_RESOLUTION);

                                // transfer most of the provider's pool tokens to the rewards vault
                                const userPoolTokenBalance = await poolToken.balanceOf(user.address);
                                await transfer(user, poolToken, rewardsVault.address, userPoolTokenBalance.sub(100));

                                const { poolTokenAmountToBurn } = await getRewards(
                                    program,
                                    token,
                                    rewardsMath,
                                    tokenData,
                                    rewardsVault
                                );

                                expect(poolTokenAmountToBurn).to.be.gte(maxBurn);
                            });

                            it('should terminate the program', async () => {
                                const poolsBefore = await autoCompoundingRewards.pools();
                                expect(poolsBefore).to.include(token.address);

                                const { tokenAmountToDistribute } = await testDistribution();
                                expect(tokenAmountToDistribute).to.equal(0);

                                const poolsAfter = await autoCompoundingRewards.pools();
                                expect(poolsAfter).to.not.include(token.address);

                                const program = await autoCompoundingRewards.program(token.address);
                                expect(program.poolToken).to.equal(ZERO_ADDRESS);
                                expect(program.totalRewards).to.equal(0);
                                expect(program.remainingRewards).to.equal(0);
                                expect(program.distributionType).to.equal(0);
                                expect(program.startTime).to.equal(0);
                                expect(program.endTime).to.equal(0);
                                expect(program.halfLife).to.equal(0);
                                expect(program.prevDistributionTimestamp).to.equal(0);
                                expect(program.isPaused).to.be.false;
                            });
                        });

                        context('if the burn amount is equal to the total pool token supply', () => {
                            beforeEach(async () => {
                                await autoCompoundingRewards.setTime(startTime + Math.floor(programDuration / 1.1));

                                const program = await autoCompoundingRewards.program(token.address);
                                const poolTokenTotalSupply = await poolToken.totalSupply();

                                // transfer most of the provider's pool tokens to the rewards vault
                                const userPoolTokenBalance = await poolToken.balanceOf(user.address);
                                await transfer(user, poolToken, rewardsVault.address, userPoolTokenBalance);

                                const { poolTokenAmountToBurn } = await getRewards(
                                    program,
                                    token,
                                    rewardsMath,
                                    tokenData,
                                    rewardsVault
                                );

                                expect(poolTokenAmountToBurn).to.equal(poolTokenTotalSupply);
                            });

                            it('should terminate the program', async () => {
                                const poolsBefore = await autoCompoundingRewards.pools();
                                expect(poolsBefore).to.include(token.address);

                                const { tokenAmountToDistribute } = await testDistribution();
                                expect(tokenAmountToDistribute).to.equal(0);

                                const poolsAfter = await autoCompoundingRewards.pools();
                                expect(poolsAfter).to.not.include(token.address);

                                const program = await autoCompoundingRewards.program(token.address);
                                expect(program.poolToken).to.equal(ZERO_ADDRESS);
                                expect(program.totalRewards).to.equal(0);
                                expect(program.remainingRewards).to.equal(0);
                                expect(program.distributionType).to.equal(0);
                                expect(program.startTime).to.equal(0);
                                expect(program.endTime).to.equal(0);
                                expect(program.halfLife).to.equal(0);
                                expect(program.prevDistributionTimestamp).to.equal(0);
                                expect(program.isPaused).to.be.false;
                            });
                        });
                    });

                    const testMultipleDistributions = (step: number, totalSteps: number) => {
                        context(
                            `in ${totalSteps} steps of ${humanizeDuration(step * 1000, { units: ['d'] })} long steps`,
                            () => {
                                it('should distribute rewards', async () => {
                                    for (let i = 0, time = startTime; i < totalSteps; i++, time += step) {
                                        await autoCompoundingRewards.setTime(time);

                                        await testDistribution();
                                    }
                                });
                            }
                        );
                    };

                    switch (distributionType) {
                        case RewardsDistributionType.Flat:
                            describe('regular tests', () => {
                                for (const percent of [25]) {
                                    testMultipleDistributions(
                                        Math.floor((programDuration * percent) / 100),
                                        Math.floor(100 / percent)
                                    );
                                }
                            });

                            describe('@stress tests', () => {
                                for (const percent of [6, 15]) {
                                    testMultipleDistributions(
                                        Math.floor((programDuration * percent) / 100),
                                        Math.floor(100 / percent)
                                    );
                                }
                            });

                            break;

                        case RewardsDistributionType.ExpDecay:
                            describe('regular tests', () => {
                                for (const step of [duration.days(1)]) {
                                    for (const totalSteps of [5]) {
                                        testMultipleDistributions(step, totalSteps);
                                    }
                                }
                            });

                            describe('@stress tests', () => {
                                for (const step of [duration.hours(1), duration.weeks(1)]) {
                                    for (const totalSteps of [5]) {
                                        testMultipleDistributions(step, totalSteps);
                                    }
                                }
                            });

                            break;

                        default:
                            throw new Error(`Unsupported type ${distributionType}`);
                    }
                });
            };

            switch (distributionType) {
                case RewardsDistributionType.Flat:
                    describe('regular tests', () => {
                        for (const programDuration of [duration.days(10)]) {
                            context(
                                `program duration of ${humanizeDuration(programDuration * 1000, { units: ['d'] })}`,
                                () => {
                                    testProgram(programDuration);
                                }
                            );
                        }
                    });

                    describe('@stress tests', () => {
                        for (const programDuration of [duration.weeks(12), duration.years(1)]) {
                            context(
                                `program duration of ${humanizeDuration(programDuration * 1000, { units: ['d'] })}`,
                                () => {
                                    testProgram(programDuration);
                                }
                            );
                        }
                    });

                    break;

                case RewardsDistributionType.ExpDecay:
                    describe('regular tests', () => {
                        for (const programDuration of [EXP_DECAY_MAX_DURATION]) {
                            context(
                                `program duration of ${humanizeDuration(programDuration * 1000, { units: ['y'] })}`,
                                () => {
                                    testProgram(programDuration);
                                }
                            );
                        }
                    });

                    break;

                default:
                    throw new Error(`Unsupported type ${distributionType}`);
            }
        };

        const testRewardsMatrix = (providerStakes: BigNumberish[], totalRewards: BigNumberish[]) => {
            const distributionTypes = Object.values(RewardsDistributionType).filter(
                (v) => typeof v === 'number'
            ) as number[];

            for (const symbol of [TokenSymbol.BNT, TokenSymbol.TKN, TokenSymbol.ETH]) {
                for (const distributionType of distributionTypes) {
                    for (const providerStake of providerStakes) {
                        for (const totalReward of totalRewards) {
                            context(
                                `total ${totalRewards} ${symbol} rewards, with initial provider stake of ${providerStake}`,
                                () => {
                                    testRewards(new TokenData(symbol), distributionType, providerStake, totalReward);
                                }
                            );
                        }
                    }
                }
            }
        };

        // ensuring that the total rewards don't exceed the supply termination threshold
        describe('regular tests', () => {
            testRewardsMatrix([toWei(50_000)], [toWei(10_000)]);
        });

        // ensuring that the total rewards don't exceed the supply termination threshold
        describe('@stress tests', () => {
            testRewardsMatrix([toWei(70_000), toWei(250_000)], [toWei(10_000), toWei(30_000)]);
        });
    });

    describe('auto-processing rewards', () => {
        const setups = [
            {
                tokenSymbol: TokenSymbol.ETH,
                initialUserStake: toWei(15_000),
                totalRewards: toWei(11_000)
            },
            {
                tokenSymbol: TokenSymbol.BNT,
                initialUserStake: toWei(20_000),
                totalRewards: toWei(12_000)
            },
            {
                tokenSymbol: TokenSymbol.TKN,
                initialUserStake: toWei(30_000),
                totalRewards: toWei(13_000)
            },
            {
                tokenSymbol: TokenSymbol.TKN1,
                initialUserStake: toWei(40_000),
                totalRewards: toWei(14_000)
            },
            {
                tokenSymbol: TokenSymbol.TKN2,
                initialUserStake: toWei(50_000),
                totalRewards: toWei(15_000)
            },
            {
                tokenSymbol: TokenSymbol.TKN2,
                initialUserStake: toWei(60_000),
                totalRewards: toWei(16_000)
            },
            {
                tokenSymbol: TokenSymbol.TKN1,
                initialUserStake: toWei(70_000),
                totalRewards: toWei(17_000)
            },
            {
                tokenSymbol: TokenSymbol.TKN,
                initialUserStake: toWei(80_000),
                totalRewards: toWei(18_000)
            }
        ];

        const tokens: TokenWithAddress[] = new Array<TokenWithAddress>(setups.length);
        const poolTokens: TokenWithAddress[] = new Array<TokenWithAddress>(setups.length);

        let autoProcessRewardsCount: number;
        let rewardsMath: TestRewardsMath;

        beforeEach(async () => {
            rewardsMath = await Contracts.TestRewardsMath.deploy();

            autoCompoundingRewards = await createAutoCompoundingRewards(
                network,
                networkSettings,
                bnt,
                bntPool,
                externalRewardsVault
            );

            autoProcessRewardsCount = (await autoCompoundingRewards.autoProcessRewardsCount()).toNumber();
        });

        const autoProcessNoRewards = async () => {
            const maxCount = AUTO_PROCESS_MAX_PROGRAMS_FACTOR * autoProcessRewardsCount;
            const prevIndex = (await autoCompoundingRewards.autoProcessRewardsIndex()).toNumber();

            const res = await autoCompoundingRewards.autoProcessRewards();
            await expect(res).not.to.emit(autoCompoundingRewards, 'RewardsDistributed');

            expect(await autoCompoundingRewards.autoProcessRewardsIndex()).to.equal(
                (prevIndex + maxCount) % setups.length
            );
        };

        const autoProcessSomeRewards = async () => {
            const maxCount = AUTO_PROCESS_MAX_PROGRAMS_FACTOR * autoProcessRewardsCount;

            const tokenAmountsToDistribute: BigNumber[] = new Array<BigNumber>(maxCount);
            const poolTokenAmountsToBurn: BigNumber[] = new Array<BigNumber>(maxCount);
            const remainingRewards: BigNumber[] = new Array<BigNumber>(maxCount);
            const prevDistributionTimestamps: number[] = new Array<number>(maxCount);

            const prevIndex = (await autoCompoundingRewards.autoProcessRewardsIndex()).toNumber();

            for (let i = 0; i < maxCount; i++) {
                const index = (prevIndex + i) % setups.length;
                const programData = await autoCompoundingRewards.program(tokens[index].address);
                const { tokenAmountToDistribute, poolTokenAmountToBurn } = await getRewards(
                    programData,
                    tokens[index],
                    rewardsMath,
                    new TokenData(setups[index].tokenSymbol),
                    setups[index].tokenSymbol === TokenSymbol.BNT ? bntPool : externalRewardsVault
                );
                tokenAmountsToDistribute[index] = tokenAmountToDistribute;
                poolTokenAmountsToBurn[index] = poolTokenAmountToBurn;
                remainingRewards[index] = programData.remainingRewards;
                prevDistributionTimestamps[index] = programData.prevDistributionTimestamp;
            }

            const res = await autoCompoundingRewards.autoProcessRewards();

            let expectedIndex = prevIndex;

            let count = autoProcessRewardsCount;
            for (let i = 0; i < maxCount; i++) {
                const index = (prevIndex + i) % setups.length;
                const programData = await autoCompoundingRewards.program(tokens[index].address);

                expectedIndex = (expectedIndex + 1) % setups.length;

                const currTime = await autoCompoundingRewards.currentTime();
                if (
                    !programData.isPaused &&
                    currTime >= prevDistributionTimestamps[index] + AUTO_PROCESS_REWARDS_MIN_TIME_DELTA
                ) {
                    if (tokenAmountsToDistribute[index].gt(0) && poolTokenAmountsToBurn[index].gt(0)) {
                        await expect(res)
                            .to.emit(autoCompoundingRewards, 'RewardsDistributed')
                            .withArgs(
                                tokens[index].address,
                                tokenAmountsToDistribute[index],
                                poolTokenAmountsToBurn[index],
                                remainingRewards[index].sub(tokenAmountsToDistribute[index])
                            );
                    }

                    count -= 1;
                    if (count === 0) {
                        break;
                    }
                }
            }

            expect(await autoCompoundingRewards.autoProcessRewardsIndex()).to.equal(expectedIndex);
        };

        const testAutoProcessing = (distributionType: RewardsDistributionType) => {
            interface Overrides {
                totalRewards?: BigNumber;
            }

            const createPrograms = async (overrides: Overrides = {}) => {
                for (const [index, setup] of setups.entries()) {
                    ({ token: tokens[index], poolToken: poolTokens[index] } = await prepareSimplePool(
                        new TokenData(setup.tokenSymbol),
                        setup.initialUserStake,
                        setup.totalRewards
                    ));

                    await createProgram(
                        distributionType,
                        autoCompoundingRewards,
                        tokens[index].address,
                        overrides.totalRewards ?? setup.totalRewards,
                        START_TIME
                    );
                }
            };

            context('regular rewards', () => {
                beforeEach(async () => {
                    await createPrograms();
                });

                it('should distribute all tokens', async () => {
                    await autoCompoundingRewards.setTime(programEndTimes[distributionType]);

                    for (let i = 0; i < Math.ceil(setups.length / autoProcessRewardsCount); i++) {
                        await autoProcessSomeRewards();
                    }

                    await autoProcessNoRewards();
                });

                it('should distribute some tokens', async () => {
                    for (let i = 0; i < 5; i++) {
                        await autoCompoundingRewards.setTime(
                            Math.floor(START_TIME + (programDurations[distributionType] * 2 ** i) / (2 ** i + 1))
                        );

                        await autoProcessSomeRewards();
                    }
                });

                it('should distribute tokens only when the minimum time period has elapsed', async () => {
                    await autoCompoundingRewards.setTime(
                        Math.floor(START_TIME + programDurations[distributionType] / 2)
                    );

                    for (let i = 0; i < Math.ceil(setups.length / autoProcessRewardsCount); i++) {
                        await autoProcessSomeRewards();
                    }

                    await autoCompoundingRewards.setTime(
                        Math.floor(START_TIME + programDurations[distributionType] / 2) +
                            AUTO_PROCESS_REWARDS_MIN_TIME_DELTA -
                            1
                    );

                    for (let i = 0; i < Math.ceil(setups.length / autoProcessRewardsCount) + 1; i++) {
                        await autoProcessNoRewards();
                    }
                });
            });

            context('small rewards', () => {
                beforeEach(async () => {
                    // using small total rewards values yields some cases where the total amount of tokens to distribute
                    // is equal to zero and some cases where the total amount of tokens to distribute is larger than
                    // zero
                    await createPrograms({ totalRewards: BigNumber.from(1) });
                });

                it('should distribute tokens only when the amount of tokens to distribute is larger than zero', async () => {
                    for (let i = 0; i < 5; i++) {
                        await autoCompoundingRewards.setTime(
                            Math.floor(START_TIME + (programDurations[distributionType] * 2 ** i) / (2 ** i + 1))
                        );
                        await autoProcessSomeRewards();
                    }
                });

                it('should distribute tokens only when the amount of pool tokens to burn is larger than zero', async () => {
                    for (let i = 0; i < 5; i++) {
                        await autoCompoundingRewards.setTime(
                            Math.floor(START_TIME + (programDurations[distributionType] * 2 ** i) / (2 ** i + 1))
                        );
                        await autoProcessSomeRewards();
                    }
                });
            });
        };

        for (const distributionType of [RewardsDistributionType.Flat, RewardsDistributionType.ExpDecay]) {
            context(distributionType === RewardsDistributionType.Flat ? 'flat' : 'exponential decay', () => {
                testAutoProcessing(distributionType);
            });
        }
    });
});
