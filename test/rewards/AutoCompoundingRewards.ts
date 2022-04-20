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
import { EXP2_INPUT_TOO_HIGH, RewardsDistributionType, ZERO_ADDRESS } from '../../utils/Constants';
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

describe.only('AutoCompoundingRewards', () => {
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

    const prepareSimplePool = async (tokenData: TokenData, providerStake: BigNumberish, totalRewards: BigNumberish) => {
        // deposit initial stake so that the participating user would have some initial amount of pool tokens
        const { token, poolToken } = await setupFundedPool(
            {
                tokenData,
                balance: providerStake,
                requestedLiquidity: tokenData.isBNT() ? max(providerStake, totalRewards).mul(1000) : 0,
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

    describe('construction', () => {
        beforeEach(async () => {
            ({ network, networkSettings, bnt, bntPool, poolCollection, externalRewardsVault } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.AutoCompoundingRewards.deploy(
                    ZERO_ADDRESS,
                    networkSettings.address,
                    bnt.address,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
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
            ).to.be.revertedWith('InvalidAddress');
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
            ).to.be.revertedWith('InvalidAddress');
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
            ).to.be.revertedWith('InvalidAddress');
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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            const autoCompoundingRewards = await createAutoCompoundingRewards(
                network,
                networkSettings,
                bnt,
                bntPool,
                externalRewardsVault
            );

            await expect(autoCompoundingRewards.initialize()).to.be.revertedWith(
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
        });
    });

    describe('management', () => {
        const MIN_LIQUIDITY_FOR_TRADING = toWei(1_000);
        const TOTAL_REWARDS = toWei(10_000);
        const INITIAL_USER_STAKE = toWei(10_000);

        const START_TIME = 1000;
        const FLAT_TOTAL_DURATION = duration.days(10);
        const EXP_DECAY_HALF_LIFE = duration.days(560);
        const EXP_DECAY_MAX_DURATION = EXP2_INPUT_TOO_HIGH.mul(EXP_DECAY_HALF_LIFE).sub(1).ceil().toNumber();

        const END_TIME = (distributionType: RewardsDistributionType) =>
            distributionType === RewardsDistributionType.Flat ? START_TIME + FLAT_TOTAL_DURATION : 0;

        const HALF_LIFE = (distributionType: RewardsDistributionType) =>
            distributionType === RewardsDistributionType.Flat ? 0 : EXP_DECAY_HALF_LIFE / duration.days(1);

        const DURATION = (distributionType: RewardsDistributionType) =>
            distributionType === RewardsDistributionType.Flat ? FLAT_TOTAL_DURATION : EXP_DECAY_MAX_DURATION;

        const createProgram = async (
            autoCompoundingRewards: TestAutoCompoundingRewards,
            pool: string,
            totalRewards: BigNumberish,
            distributionType: RewardsDistributionType,
            startTime: number,
            endTime: number,
            halfLifeInDays: number
        ) => {
            switch (distributionType) {
                case RewardsDistributionType.Flat:
                    return autoCompoundingRewards.createFlatProgram(pool, totalRewards, startTime, endTime);
                case RewardsDistributionType.ExponentialDecay:
                    return autoCompoundingRewards.createExpProgram(pool, totalRewards, startTime, halfLifeInDays);
            }
        };

        beforeEach(async () => {
            ({ network, networkInfo, networkSettings, bnt, bntPool, poolCollection, externalRewardsVault } =
                await createSystem());

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
                                autoCompoundingRewards.connect(user),
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
                            )
                        ).to.be.revertedWith('AccessDenied');
                    });

                    it('should revert when the reserve token is invalid', async () => {
                        await expect(
                            createProgram(
                                autoCompoundingRewards,
                                ZERO_ADDRESS,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
                            )
                        ).to.revertedWith('InvalidAddress');
                    });

                    it('should revert when the program already exists', async () => {
                        await createProgram(
                            autoCompoundingRewards,
                            token.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME(distributionType),
                            HALF_LIFE(distributionType)
                        );

                        await expect(
                            createProgram(
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
                            )
                        ).to.revertedWith('AlreadyExists');
                    });

                    it('should revert when the total rewards are equal to 0', async () => {
                        await expect(
                            createProgram(
                                autoCompoundingRewards,
                                token.address,
                                0,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
                            )
                        ).to.revertedWith('ZeroValue');
                    });

                    it('should revert when the pool is not whitelisted', async () => {
                        const nonWhitelistedToken = await createTestToken();

                        await expect(
                            createProgram(
                                autoCompoundingRewards,
                                nonWhitelistedToken.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
                            )
                        ).to.revertedWith('NotWhitelisted');
                    });

                    for (let startTime = 0; startTime < 4; startTime++) {
                        for (let endTime = 0; endTime < 4; endTime++) {
                            for (let currTime = 0; currTime < 4; currTime++) {
                                let isProgramTimingValid: boolean;

                                switch (distributionType) {
                                    case RewardsDistributionType.Flat:
                                        isProgramTimingValid = currTime <= startTime && startTime < endTime;
                                        break;
                                    case RewardsDistributionType.ExponentialDecay:
                                        isProgramTimingValid = currTime <= startTime;
                                        break;
                                }

                                context(`[startTime, endTime, currTime] = ${[startTime, endTime, currTime]}`, () => {
                                    beforeEach(async () => {
                                        await autoCompoundingRewards.setTime(currTime);
                                    });

                                    if (isProgramTimingValid) {
                                        it(`should complete`, async () => {
                                            const poolsBefore = await autoCompoundingRewards.pools();
                                            expect(poolsBefore).to.not.include(token.address);

                                            const res = await createProgram(
                                                autoCompoundingRewards,
                                                token.address,
                                                TOTAL_REWARDS,
                                                distributionType,
                                                startTime,
                                                endTime,
                                                HALF_LIFE(distributionType)
                                            );

                                            const poolsAfter = await autoCompoundingRewards.pools();
                                            expect(poolsAfter).to.include(token.address);

                                            await expect(res)
                                                .to.emit(autoCompoundingRewards, 'ProgramCreated')
                                                .withArgs(
                                                    token.address,
                                                    distributionType,
                                                    TOTAL_REWARDS,
                                                    startTime,
                                                    endTime,
                                                    HALF_LIFE(distributionType)
                                                );

                                            const program = await autoCompoundingRewards.program(token.address);

                                            expect(program.poolToken).to.equal(poolToken.address);
                                            expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                                            expect(program.remainingRewards).to.equal(TOTAL_REWARDS);
                                            expect(program.distributionType).to.equal(distributionType);
                                            expect(program.startTime).to.equal(startTime);
                                            expect(program.endTime).to.equal(endTime);
                                            expect(program.halfLife).to.equal(
                                                HALF_LIFE(distributionType) * duration.days(1)
                                            );
                                            expect(program.prevDistributionTimestamp).to.equal(0);
                                            expect(program.isEnabled).to.be.true;
                                        });
                                    } else {
                                        it(`should revert`, async () => {
                                            const poolsBefore = await autoCompoundingRewards.pools();
                                            expect(poolsBefore).to.not.include(token.address);

                                            await expect(
                                                createProgram(
                                                    autoCompoundingRewards,
                                                    token.address,
                                                    TOTAL_REWARDS,
                                                    distributionType,
                                                    startTime,
                                                    endTime,
                                                    HALF_LIFE(distributionType)
                                                )
                                            ).to.be.revertedWith('InvalidParam');
                                        });
                                    }
                                });
                            }
                        }
                    }
                });

                describe('termination', () => {
                    it('should revert when a non-admin attempts to terminate a program', async () => {
                        await expect(
                            autoCompoundingRewards.connect(user).terminateProgram(token.address)
                        ).to.be.revertedWith('AccessDenied');
                    });

                    context('when a program does not exist', () => {
                        it('should revert', async () => {
                            await expect(autoCompoundingRewards.terminateProgram(token.address)).to.revertedWith(
                                'DoesNotExist'
                            );
                        });
                    });

                    context('when a program is already created', () => {
                        beforeEach(async () => {
                            await createProgram(
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
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
                                .withArgs(token.address, END_TIME(distributionType), TOTAL_REWARDS);

                            const program = await autoCompoundingRewards.program(token.address);

                            expect(program.poolToken).to.equal(ZERO_ADDRESS);
                            expect(program.totalRewards).to.equal(0);
                            expect(program.remainingRewards).to.equal(0);
                            expect(program.distributionType).to.equal(0);
                            expect(program.startTime).to.equal(0);
                            expect(program.endTime).to.equal(0);
                            expect(program.halfLife).to.equal(0);
                            expect(program.prevDistributionTimestamp).to.equal(0);
                            expect(program.isEnabled).to.be.false;
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
                                .withArgs(token.address, END_TIME(distributionType), TOTAL_REWARDS);

                            const program = await autoCompoundingRewards.program(token.address);

                            expect(program.poolToken).to.equal(ZERO_ADDRESS);
                            expect(program.totalRewards).to.equal(0);
                            expect(program.remainingRewards).to.equal(0);
                            expect(program.distributionType).to.equal(0);
                            expect(program.startTime).to.equal(0);
                            expect(program.endTime).to.equal(0);
                            expect(program.halfLife).to.equal(0);
                            expect(program.prevDistributionTimestamp).to.equal(0);
                            expect(program.isEnabled).to.be.false;
                        });
                    });
                });

                describe('enabling / disabling', () => {
                    beforeEach(async () => {
                        await createProgram(
                            autoCompoundingRewards,
                            token.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME(distributionType),
                            HALF_LIFE(distributionType)
                        );
                    });

                    it('should revert when a non-admin attempts to enable / disable a program', async () => {
                        await expect(
                            autoCompoundingRewards.connect(user).enableProgram(token.address, true)
                        ).to.be.revertedWith('AccessDenied');
                    });

                    it('should revert when attempting to enable / disable a non-existing program', async () => {
                        const newToken = await createTestToken();

                        await expect(autoCompoundingRewards.enableProgram(newToken.address, true)).to.be.revertedWith(
                            'DoesNotExist'
                        );
                        await expect(autoCompoundingRewards.enableProgram(newToken.address, false)).to.be.revertedWith(
                            'DoesNotExist'
                        );
                    });

                    it('should enable a program', async () => {
                        await autoCompoundingRewards.enableProgram(token.address, false);

                        let program = await autoCompoundingRewards.program(token.address);

                        expect(program.isEnabled).to.be.false;

                        await expect(autoCompoundingRewards.enableProgram(token.address, true))
                            .to.emit(autoCompoundingRewards, 'ProgramEnabled')
                            .withArgs(token.address, true, TOTAL_REWARDS);

                        program = await autoCompoundingRewards.program(token.address);

                        expect(program.isEnabled).to.be.true;
                    });

                    it('should disable a program', async () => {
                        let program = await autoCompoundingRewards.program(token.address);

                        expect(program.isEnabled).to.be.true;

                        await expect(autoCompoundingRewards.enableProgram(token.address, false))
                            .to.emit(autoCompoundingRewards, 'ProgramEnabled')
                            .withArgs(token.address, false, TOTAL_REWARDS);

                        program = await autoCompoundingRewards.program(token.address);

                        expect(program.isEnabled).to.be.false;
                    });

                    it('should ignore updating to the same status', async () => {
                        let program = await autoCompoundingRewards.program(token.address);

                        expect(program.isEnabled).to.be.true;

                        await expect(autoCompoundingRewards.enableProgram(token.address, true)).not.to.emit(
                            autoCompoundingRewards,
                            'ProgramEnabled'
                        );

                        await autoCompoundingRewards.enableProgram(token.address, false);

                        program = await autoCompoundingRewards.program(token.address);

                        expect(program.isEnabled).to.be.false;

                        await expect(autoCompoundingRewards.enableProgram(token.address, false)).not.to.emit(
                            autoCompoundingRewards,
                            'ProgramEnabled'
                        );
                    });
                });

                describe('processing rewards', () => {
                    beforeEach(async () => {
                        await createProgram(
                            autoCompoundingRewards,
                            token.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME(distributionType),
                            HALF_LIFE(distributionType)
                        );
                    });

                    it('should distribute tokens only when the program is enabled', async () => {
                        await autoCompoundingRewards.setTime(START_TIME + DURATION(distributionType));
                        await autoCompoundingRewards.enableProgram(token.address, false);
                        const res1 = await autoCompoundingRewards.processRewards(token.address);
                        await expect(res1).not.to.emit(autoCompoundingRewards, 'RewardsDistributed');
                        await autoCompoundingRewards.enableProgram(token.address, true);
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

                    for (let startTime = 0; startTime < 5; startTime++) {
                        for (let endTime = 0; endTime < 5; endTime++) {
                            for (let creationTime = 0; creationTime < 5; creationTime++) {
                                for (let elapsedTime = 0; elapsedTime < 5; elapsedTime++) {
                                    const currTime = creationTime + elapsedTime;

                                    let isProgramTimingValid: boolean;
                                    let isProgramTimingActive: boolean;

                                    switch (distributionType) {
                                        case RewardsDistributionType.Flat:
                                            isProgramTimingValid = creationTime <= startTime && startTime < endTime;
                                            isProgramTimingActive = startTime <= currTime && currTime <= endTime;
                                            break;

                                        case RewardsDistributionType.ExponentialDecay:
                                            isProgramTimingValid = creationTime <= startTime;
                                            isProgramTimingActive = startTime <= currTime;
                                            break;
                                    }

                                    if (isProgramTimingValid) {
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

                                                    await createProgram(
                                                        autoCompoundingRewards,
                                                        token.address,
                                                        TOTAL_REWARDS,
                                                        distributionType,
                                                        startTime,
                                                        endTime,
                                                        HALF_LIFE(distributionType)
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
                                    }
                                }
                            }
                        }
                    }

                    context('before a program has started', () => {
                        beforeEach(async () => {
                            await createProgram(
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
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
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
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
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
                            );

                            await autoCompoundingRewards.setTime(START_TIME + DURATION(distributionType) + 1);
                        });

                        switch (distributionType) {
                            case RewardsDistributionType.Flat:
                                it('should return false', async () => {
                                    expect(await autoCompoundingRewards.isProgramActive(token.address)).to.be.false;
                                });
                                break;

                            case RewardsDistributionType.ExponentialDecay:
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
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
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
                                    autoCompoundingRewards,
                                    currToken.address,
                                    TOTAL_REWARDS,
                                    distributionType,
                                    START_TIME,
                                    END_TIME(distributionType),
                                    HALF_LIFE(distributionType)
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
                                await expect(
                                    createProgram(
                                        autoCompoundingRewards,
                                        token.address,
                                        maxTotalRewards,
                                        distributionType,
                                        START_TIME,
                                        END_TIME(distributionType),
                                        HALF_LIFE(distributionType)
                                    )
                                ).to.emit(autoCompoundingRewards, 'ProgramCreated');
                            });

                            it('should revert when the funds are not sufficient for backing the total rewards', async () => {
                                await expect(
                                    createProgram(
                                        autoCompoundingRewards,
                                        token.address,
                                        maxTotalRewards.add(1),
                                        distributionType,
                                        START_TIME,
                                        END_TIME(distributionType),
                                        HALF_LIFE(distributionType)
                                    )
                                ).to.revertedWith('InsufficientFunds');
                            });
                        });

                        it('should create the program', async () => {
                            const res = await createProgram(
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
                            );

                            await expect(res)
                                .to.emit(autoCompoundingRewards, 'ProgramCreated')
                                .withArgs(
                                    token.address,
                                    distributionType,
                                    TOTAL_REWARDS,
                                    START_TIME,
                                    END_TIME(distributionType),
                                    HALF_LIFE(distributionType)
                                );

                            const program = await autoCompoundingRewards.program(token.address);

                            expect(program.poolToken).to.equal(poolToken.address);
                            expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                            expect(program.remainingRewards).to.equal(TOTAL_REWARDS);
                            expect(program.distributionType).to.equal(distributionType);
                            expect(program.startTime).to.equal(START_TIME);
                            expect(program.endTime).to.equal(END_TIME(distributionType));
                            expect(program.halfLife).to.equal(HALF_LIFE(distributionType) * duration.days(1));
                            expect(program.prevDistributionTimestamp).to.equal(0);
                            expect(program.isEnabled).to.be.true;
                        });
                    });

                    describe('processing rewards', () => {
                        let rewardsVault: IVault;

                        beforeEach(async () => {
                            await createProgram(
                                autoCompoundingRewards,
                                token.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME(distributionType),
                                HALF_LIFE(distributionType)
                            );

                            rewardsVault = tokenData.isBNT() ? bntPool : externalRewardsVault;
                        });

                        it('should revert when there are insufficient funds', async () => {
                            if (tokenData.isBNT()) {
                                await bntPool.grantRole(Roles.BNTPool.ROLE_BNT_POOL_TOKEN_MANAGER, deployer.address);
                            } else {
                                await externalRewardsVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, deployer.address);
                            }

                            await autoCompoundingRewards.setTime(START_TIME + DURATION(distributionType));

                            const balance = await (poolToken as PoolToken).balanceOf(rewardsVault.address);
                            await rewardsVault.withdrawFunds(poolToken.address, deployer.address, balance.sub(1));

                            await expect(autoCompoundingRewards.processRewards(token.address)).to.be.revertedWith(
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

        for (const distributionType of [RewardsDistributionType.Flat, RewardsDistributionType.ExponentialDecay]) {
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
                ({
                    network,
                    networkInfo,
                    networkSettings,
                    bnt,
                    bntPool,
                    bntPoolToken,
                    poolCollection,
                    externalRewardsVault
                } = await createSystem());

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

            const getRewards = async (program: any) => {
                const currTime = await autoCompoundingRewards.currentTime();
                const prevTime = Math.max(program.prevDistributionTimestamp, program.startTime);

                if (!program.isEnabled || program.startTime > currTime) {
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

                    case RewardsDistributionType.ExponentialDecay:
                        currTimeElapsed = currTime - program.startTime;
                        prevTimeElapsed = prevTime - program.startTime;
                        tokenAmountToDistribute = (
                            await rewardsMath.calcExpDecayRewards(
                                program.totalRewards,
                                currTimeElapsed,
                                EXP_DECAY_HALF_LIFE
                            )
                        ).sub(
                            await rewardsMath.calcExpDecayRewards(
                                program.totalRewards,
                                prevTimeElapsed,
                                EXP_DECAY_HALF_LIFE
                            )
                        );

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

            const testDistribution = async () => {
                const prevProgram = await autoCompoundingRewards.program(token.address);
                const prevPoolTokenBalance = await poolToken.balanceOf(rewardsVault.address);
                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                const prevUserTokenOwned = await getPoolTokenUnderlying(user);
                const prevExternalRewardsVaultTokenOwned = await getPoolTokenUnderlying(rewardsVault);

                const { tokenAmountToDistribute, poolTokenAmountToBurn } = await getRewards(prevProgram);

                const res = await autoCompoundingRewards.processRewards(token.address);
                const program = await autoCompoundingRewards.program(token.address);

                if (tokenAmountToDistribute.eq(0) || poolTokenAmountToBurn.eq(0)) {
                    await expect(res).not.to.emit(autoCompoundingRewards, 'RewardsDistributed');

                    expect(program.prevDistributionTimestamp).to.equal(prevProgram.prevDistributionTimestamp);
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
                            maxAbsoluteError: new Decimal(0),
                            maxRelativeError: new Decimal('0000000000000000000002'),
                            relation: Relation.LesserOrEqual
                        });
                        expect(actualRewardsVaultTokenOwned).to.be.almostEqual(expectedRewardsVaultTokenOwned, {
                            maxAbsoluteError: new Decimal(1),
                            maxRelativeError: new Decimal('0000000000000000000014'),
                            relation: Relation.GreaterOrEqual
                        });
                        break;

                    case RewardsDistributionType.ExponentialDecay:
                        expect(actualUserTokenOwned).to.be.almostEqual(expectedUserTokenOwned, {
                            maxAbsoluteError: new Decimal(0),
                            maxRelativeError: new Decimal('0000000000000000000002'),
                            relation: Relation.LesserOrEqual
                        });
                        expect(actualRewardsVaultTokenOwned).to.be.almostEqual(expectedRewardsVaultTokenOwned, {
                            maxAbsoluteError: new Decimal(0),
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

                        (await distributionType) === RewardsDistributionType.Flat
                            ? autoCompoundingRewards.createFlatProgram(
                                  token.address,
                                  totalRewards,
                                  startTime,
                                  startTime + programDuration
                              )
                            : autoCompoundingRewards.createExpProgram(
                                  token.address,
                                  totalRewards,
                                  startTime,
                                  EXP_DECAY_HALF_LIFE / duration.days(1)
                              );
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

                                case RewardsDistributionType.ExponentialDecay:
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

                                case RewardsDistributionType.ExponentialDecay:
                                    it('should revert with an overflow', async () => {
                                        await expect(
                                            autoCompoundingRewards.processRewards(token.address)
                                        ).to.be.revertedWith('Overflow');
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

                            context('disabled', () => {
                                beforeEach(async () => {
                                    await autoCompoundingRewards.enableProgram(token.address, false);
                                });

                                it('should not distribute any rewards', async () => {
                                    const { tokenAmountToDistribute } = await testDistribution();
                                    expect(tokenAmountToDistribute).to.equal(0);
                                });
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

                        case RewardsDistributionType.ExponentialDecay:
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

                case RewardsDistributionType.ExponentialDecay:
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

        describe('regular tests', () => {
            testRewardsMatrix([toWei(10_000)], [toWei(100_000)]);
        });

        describe('@stress tests', () => {
            testRewardsMatrix([toWei(5_000), toWei(100_000)], [100_000, toWei(200_000)]);
        });
    });
});
