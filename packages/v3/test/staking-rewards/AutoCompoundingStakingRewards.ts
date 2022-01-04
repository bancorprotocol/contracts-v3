import Contracts from '../../components/Contracts';
import {
    TestStakingRewardsMath,
    BancorNetworkInfo,
    ExternalRewardsVault,
    IERC20,
    IVault,
    NetworkSettings,
    PoolToken,
    TestAutoCompoundingStakingRewards,
    TestBancorNetwork,
    TestMasterPool,
    TestPoolCollection
} from '../../typechain-types';
import { expectRole, roles } from '../helpers/AccessControl';
import { BNT, ETH, TKN, ZERO_ADDRESS, StakingRewardsDistributionTypes, ExponentialDecay } from '../helpers/Constants';
import { createStakingRewards, createSystem, depositToPool, setupSimplePool } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest, duration } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { Addressable, createTokenBySymbol, TokenWithAddress, transfer } from '../helpers/Utils';
import { Relation } from '../matchers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import humanizeDuration from 'humanize-duration';

const { Upgradeable: UpgradeableRoles } = roles;

describe('AutoCompoundingStakingRewards', () => {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let stakingRewardsProvider: SignerWithAddress;

    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let networkSettings: NetworkSettings;
    let masterPool: TestMasterPool;
    let masterPoolToken: PoolToken;
    let networkToken: IERC20;
    let poolCollection: TestPoolCollection;
    let externalRewardsVault: ExternalRewardsVault;

    let autoCompoundingStakingRewards: TestAutoCompoundingStakingRewards;

    shouldHaveGap('AutoCompoundingStakingRewards', '_programs');

    before(async () => {
        [deployer, user, stakingRewardsProvider] = await ethers.getSigners();
    });

    const prepareSimplePool = async (symbol: string, providerStake: BigNumberish, totalRewards: BigNumberish) => {
        const isNetworkToken = symbol === BNT;

        // deposit initial stake so that the participating user would have some initial amount of pool tokens
        const { token, poolToken } = await setupSimplePool(
            {
                symbol,
                balance: providerStake,
                requestedLiquidity: isNetworkToken
                    ? BigNumber.max(BigNumber.from(providerStake), BigNumber.from(totalRewards)).mul(1000)
                    : 0,
                initialRate: { n: 1, d: 2 }
            },
            user,
            network,
            networkInfo,
            networkSettings,
            poolCollection
        );

        // if we're rewarding the network token - no additional funding is needed
        if (!isNetworkToken) {
            // deposit pool tokens as staking rewards
            await depositToPool(stakingRewardsProvider, token, totalRewards, network);

            await transfer(
                stakingRewardsProvider,
                poolToken,
                externalRewardsVault,
                await poolToken.balanceOf(stakingRewardsProvider.address)
            );
        }

        return { token, poolToken };
    };

    describe('construction', () => {
        beforeEach(async () => {
            ({ network, networkSettings, networkToken, masterPool, poolCollection, externalRewardsVault } =
                await createSystem());

            autoCompoundingStakingRewards = await createStakingRewards(
                network,
                networkSettings,
                networkToken,
                masterPool,
                externalRewardsVault
            );
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(
                    ZERO_ADDRESS,
                    networkSettings.address,
                    networkToken.address,
                    masterPool.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    networkToken.address,
                    masterPool.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network token contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(
                    network.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    masterPool.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master pool contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(
                    network.address,
                    networkSettings.address,
                    networkToken.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(autoCompoundingStakingRewards.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await autoCompoundingStakingRewards.version()).to.equal(1);

            await expectRole(autoCompoundingStakingRewards, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('management', () => {
        const testProgramManagement = (symbol: string, distributionType: StakingRewardsDistributionTypes) => {
            const isNetworkToken = symbol === BNT;

            let token: TokenWithAddress;
            let poolToken: TokenWithAddress;
            let rewardsVault: IVault;

            const MIN_LIQUIDITY_FOR_TRADING = toWei(1_000);
            const TOTAL_DURATION = duration.days(10);
            const TOTAL_REWARDS = 10;
            const INITIAL_USER_STAKE = 10;

            let START_TIME = 1000;
            let END_TIME = distributionType === StakingRewardsDistributionTypes.Flat ? START_TIME + TOTAL_DURATION : 0;

            beforeEach(async () => {
                ({
                    network,
                    networkInfo,
                    networkSettings,
                    networkToken,
                    masterPool,
                    poolCollection,
                    externalRewardsVault
                } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                autoCompoundingStakingRewards = await createStakingRewards(
                    network,
                    networkSettings,
                    networkToken,
                    masterPool,
                    externalRewardsVault
                );

                ({ token, poolToken } = await prepareSimplePool(symbol, INITIAL_USER_STAKE, TOTAL_REWARDS));

                rewardsVault = isNetworkToken ? masterPool : externalRewardsVault;
            });

            describe('creation', () => {
                it('should revert when a non-admin attempts to create a program', async () => {
                    await expect(
                        autoCompoundingStakingRewards
                            .connect(user)
                            .createProgram(
                                token.address,
                                rewardsVault.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME
                            )
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should revert when the reserve token is invalid', async () => {
                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            ZERO_ADDRESS,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        )
                    ).to.revertedWith('InvalidAddress');
                });

                it('should revert when the rewards vault contract is invalid', async () => {
                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            token.address,
                            ZERO_ADDRESS,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        )
                    ).to.revertedWith('InvalidAddress');
                });

                it('should revert when the rewards vault is incompatible', async () => {
                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            networkToken.address,
                            externalRewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        )
                    ).to.revertedWith('InvalidParam');
                });

                it('should revert when the program has already been created', async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        rewardsVault.address,
                        TOTAL_REWARDS,
                        distributionType,
                        START_TIME,
                        END_TIME
                    );

                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        )
                    ).to.revertedWith('ProgramAlreadyCreated');
                });

                it('should revert when the total rewards are equal to 0', async () => {
                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            0,
                            distributionType,
                            START_TIME,
                            END_TIME
                        )
                    ).to.revertedWith('InvalidParam');
                });

                for (let startTime = 0; startTime < 4; startTime++) {
                    for (let endTime = 0; endTime < 4; endTime++) {
                        for (let currTime = 0; currTime < 4; currTime++) {
                            let isProgramTimingValid: boolean;

                            switch (distributionType) {
                                case StakingRewardsDistributionTypes.Flat:
                                    isProgramTimingValid = currTime < startTime && startTime < endTime;
                                    break;
                                case StakingRewardsDistributionTypes.ExponentialDecay:
                                    isProgramTimingValid = currTime < startTime && endTime == 0;
                                    break;
                            }

                            context(`[startTime, endTime, currTime] = ${[startTime, endTime, currTime]}`, () => {
                                beforeEach(async () => {
                                    await autoCompoundingStakingRewards.setTime(currTime);
                                });

                                if (isProgramTimingValid) {
                                    it(`should complete`, async () => {
                                        const res = await autoCompoundingStakingRewards.createProgram(
                                            token.address,
                                            rewardsVault.address,
                                            TOTAL_REWARDS,
                                            distributionType,
                                            startTime,
                                            endTime
                                        );

                                        await expect(res)
                                            .to.emit(autoCompoundingStakingRewards, 'ProgramCreated')
                                            .withArgs(
                                                token.address,
                                                distributionType,
                                                rewardsVault.address,
                                                TOTAL_REWARDS,
                                                startTime,
                                                endTime
                                            );

                                        const program = await autoCompoundingStakingRewards.program(token.address);

                                        expect(program.poolToken).to.equal(poolToken.address);
                                        expect(program.rewardsVault).to.equal(rewardsVault.address);
                                        expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                                        expect(program.remainingRewards).to.equal(TOTAL_REWARDS);
                                        expect(program.distributionType).to.equal(distributionType);
                                        expect(program.startTime).to.equal(startTime);
                                        expect(program.endTime).to.equal(endTime);
                                        expect(program.prevDistributionTimestamp).to.equal(startTime);
                                        expect(program.isEnabled).to.be.true;
                                    });
                                } else {
                                    it(`should revert`, async () => {
                                        await expect(
                                            autoCompoundingStakingRewards.createProgram(
                                                token.address,
                                                rewardsVault.address,
                                                TOTAL_REWARDS,
                                                distributionType,
                                                startTime,
                                                endTime
                                            )
                                        ).to.be.revertedWith('InvalidParam');
                                    });
                                }
                            });
                        }
                    }
                }

                it('should revert when the pool is not whitelisted', async () => {
                    const nonWhitelistedToken = await createTokenBySymbol(TKN);

                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            nonWhitelistedToken.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        )
                    ).to.revertedWith('NotWhitelisted');
                });

                it('should revert when there is not enough funds in the external rewards vault', async () => {
                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            BigNumber.from(isNetworkToken ? await masterPool.stakedBalance() : TOTAL_REWARDS).add(1),
                            distributionType,
                            START_TIME,
                            END_TIME
                        )
                    ).to.revertedWith('InsufficientFunds');
                });

                it('should create the program', async () => {
                    const res = await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        rewardsVault.address,
                        TOTAL_REWARDS,
                        distributionType,
                        START_TIME,
                        END_TIME
                    );

                    await expect(res)
                        .to.emit(autoCompoundingStakingRewards, 'ProgramCreated')
                        .withArgs(
                            token.address,
                            distributionType,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            START_TIME,
                            END_TIME
                        );

                    const program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.poolToken).to.equal(poolToken.address);
                    expect(program.rewardsVault).to.equal(rewardsVault.address);
                    expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                    expect(program.remainingRewards).to.equal(TOTAL_REWARDS);
                    expect(program.distributionType).to.equal(distributionType);
                    expect(program.startTime).to.equal(START_TIME);
                    expect(program.endTime).to.equal(END_TIME);
                    expect(program.prevDistributionTimestamp).to.equal(START_TIME);
                    expect(program.isEnabled).to.be.true;
                });
            });

            describe('termination', () => {
                it('should revert when a non-admin attempts to terminate a program', async () => {
                    await expect(
                        autoCompoundingStakingRewards.connect(user).terminateProgram(token.address)
                    ).to.be.revertedWith('AccessDenied');
                });

                context('when a program is not yet created', () => {
                    it('should revert', async () => {
                        await expect(autoCompoundingStakingRewards.terminateProgram(token.address)).to.revertedWith(
                            'ProgramNotYetCreated'
                        );
                    });
                });

                context('when a program is already created', () => {
                    beforeEach(async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        );
                    });

                    it('should terminate a program which has not yet started', async () => {
                        const res = autoCompoundingStakingRewards.terminateProgram(token.address);

                        await expect(res)
                            .to.emit(autoCompoundingStakingRewards, 'ProgramTerminated')
                            .withArgs(token.address, END_TIME, TOTAL_REWARDS);

                        const program = await autoCompoundingStakingRewards.program(token.address);

                        expect(program.poolToken).to.equal(ZERO_ADDRESS);
                        expect(program.rewardsVault).to.equal(ZERO_ADDRESS);
                        expect(program.totalRewards).to.equal(0);
                        expect(program.remainingRewards).to.equal(0);
                        expect(program.distributionType).to.equal(0);
                        expect(program.startTime).to.equal(0);
                        expect(program.endTime).to.equal(0);
                        expect(program.prevDistributionTimestamp).to.equal(0);
                        expect(program.isEnabled).to.be.false;
                    });

                    it('should terminate a program which has already started', async () => {
                        await autoCompoundingStakingRewards.setTime(START_TIME);

                        const res = autoCompoundingStakingRewards.terminateProgram(token.address);

                        await expect(res)
                            .to.emit(autoCompoundingStakingRewards, 'ProgramTerminated')
                            .withArgs(token.address, END_TIME, TOTAL_REWARDS);

                        const program = await autoCompoundingStakingRewards.program(token.address);

                        expect(program.poolToken).to.equal(ZERO_ADDRESS);
                        expect(program.rewardsVault).to.equal(ZERO_ADDRESS);
                        expect(program.totalRewards).to.equal(0);
                        expect(program.remainingRewards).to.equal(0);
                        expect(program.distributionType).to.equal(0);
                        expect(program.startTime).to.equal(0);
                        expect(program.endTime).to.equal(0);
                        expect(program.prevDistributionTimestamp).to.equal(0);
                        expect(program.isEnabled).to.be.false;
                    });
                });
            });

            describe('enabling / disabling', () => {
                beforeEach(async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        rewardsVault.address,
                        TOTAL_REWARDS,
                        distributionType,
                        START_TIME,
                        END_TIME
                    );
                });

                it('should revert when a non-admin attempts to enable / disable a program', async () => {
                    await expect(
                        autoCompoundingStakingRewards.connect(user).enableProgram(token.address, true)
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should enable a program', async () => {
                    await autoCompoundingStakingRewards.enableProgram(token.address, false);

                    let program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.isEnabled).to.be.false;

                    await expect(autoCompoundingStakingRewards.enableProgram(token.address, true))
                        .to.emit(autoCompoundingStakingRewards, 'ProgramEnabled')
                        .withArgs(token.address, true, TOTAL_REWARDS);

                    program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.isEnabled).to.be.true;
                });

                it('should disable a program', async () => {
                    let program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.isEnabled).to.be.true;

                    await expect(autoCompoundingStakingRewards.enableProgram(token.address, false))
                        .to.emit(autoCompoundingStakingRewards, 'ProgramEnabled')
                        .withArgs(token.address, false, TOTAL_REWARDS);

                    program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.isEnabled).to.be.false;
                });

                it('should ignore updating to the same status', async () => {
                    let program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.isEnabled).to.be.true;

                    await expect(autoCompoundingStakingRewards.enableProgram(token.address, true)).not.to.emit(
                        autoCompoundingStakingRewards,
                        'ProgramEnabled'
                    );

                    await autoCompoundingStakingRewards.enableProgram(token.address, false);

                    program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.isEnabled).to.be.false;

                    await expect(autoCompoundingStakingRewards.enableProgram(token.address, false)).not.to.emit(
                        autoCompoundingStakingRewards,
                        'ProgramEnabled'
                    );
                });
            });

            describe('processing rewards', () => {
                beforeEach(async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        rewardsVault.address,
                        TOTAL_REWARDS,
                        distributionType,
                        START_TIME,
                        END_TIME
                    );
                });

                it('should revert when there are insufficient funds', async () => {
                    switch (rewardsVault.address) {
                        case masterPool.address:
                            await masterPool.grantRole(roles.MasterPool.ROLE_MASTER_POOL_TOKEN_MANAGER, deployer.address);
                            break;
                        case externalRewardsVault.address:
                            await externalRewardsVault.grantRole(roles.ExternalRewardsVault.ROLE_ASSET_MANAGER, deployer.address);
                            break;
                    }

                    await autoCompoundingStakingRewards.setTime(END_TIME ? END_TIME : ExponentialDecay.MAX_DURATION);

                    const balance = await (poolToken as PoolToken).balanceOf(rewardsVault.address);
                    await rewardsVault.withdrawFunds(poolToken.address, deployer.address, balance);
                    await expect(
                        autoCompoundingStakingRewards.processRewards(token.address)
                    ).to.be.revertedWith('InsufficientFunds');
                });

                it('should distribute tokens only when the program is enabled', async () => {
                    await autoCompoundingStakingRewards.setTime(END_TIME ? END_TIME : ExponentialDecay.MAX_DURATION);
                    await autoCompoundingStakingRewards.enableProgram(token.address, false);
                    const res1 = await autoCompoundingStakingRewards.processRewards(token.address);
                    await expect(res1).not.to.emit(autoCompoundingStakingRewards, 'RewardsDistributed');
                    await autoCompoundingStakingRewards.enableProgram(token.address, true);
                    const res2 = await autoCompoundingStakingRewards.processRewards(token.address);
                    await expect(res2).to.emit(autoCompoundingStakingRewards, 'RewardsDistributed');
                });

                if (distributionType === StakingRewardsDistributionTypes.Flat) {
                    for (const seconds of [Math.floor(END_TIME - TOTAL_DURATION / 2), END_TIME, END_TIME + TOTAL_DURATION]) {
                        it(`should distribute tokens after ${seconds} seconds`, async () => {
                            await autoCompoundingStakingRewards.setTime(seconds);
                            const res1 = await autoCompoundingStakingRewards.processRewards(token.address);
                            await expect(res1).to.emit(autoCompoundingStakingRewards, 'RewardsDistributed');
                            await autoCompoundingStakingRewards.setTime(END_TIME + TOTAL_DURATION * 2);
                            const res2 = await autoCompoundingStakingRewards.processRewards(token.address);
                            if (seconds < END_TIME) {
                                await expect(res2).to.emit(autoCompoundingStakingRewards, 'RewardsDistributed');
                                await autoCompoundingStakingRewards.setTime(END_TIME + TOTAL_DURATION * 4);
                                const res3 = await autoCompoundingStakingRewards.processRewards(token.address);
                                await expect(res3).not.to.emit(autoCompoundingStakingRewards, 'RewardsDistributed');
                            } else {
                                await expect(res2).not.to.emit(autoCompoundingStakingRewards, 'RewardsDistributed');
                            }
                        });
                    }
                }
            });

            describe('is program active', () => {
                context('before a program has been created', () => {
                    it('should return false', async () => {
                        expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
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
                                    case StakingRewardsDistributionTypes.Flat:
                                        isProgramTimingValid = creationTime < startTime && startTime < endTime;
                                        isProgramTimingActive = startTime <= currTime && currTime <= endTime;
                                        break;
                                    case StakingRewardsDistributionTypes.ExponentialDecay:
                                        isProgramTimingValid = creationTime < startTime && endTime == 0;
                                        isProgramTimingActive = startTime <= currTime;
                                        break;
                                }

                                if (isProgramTimingValid) {
                                    context(`[startTime, endTime, creationTime, elapsedTime] = ${[startTime, endTime, creationTime, elapsedTime]}`, () => {
                                        beforeEach(async () => {
                                            await autoCompoundingStakingRewards.setTime(creationTime);

                                            await autoCompoundingStakingRewards.createProgram(
                                                token.address,
                                                rewardsVault.address,
                                                TOTAL_REWARDS,
                                                distributionType,
                                                startTime,
                                                endTime
                                            );

                                            await autoCompoundingStakingRewards.setTime(currTime);
                                        });

                                        it(`should return ${isProgramTimingActive}`, async () => {
                                            expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.equal(isProgramTimingActive);
                                        });
                                    });
                                }
                            }
                        }
                    }
                }

                context('before a program has started', () => {
                    beforeEach(async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        );

                        await autoCompoundingStakingRewards.setTime(START_TIME - 1);
                    });

                    it('should return false', async () => {
                        expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
                    });
                });

                context('after a program has started', () => {
                    beforeEach(async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        );

                        await autoCompoundingStakingRewards.setTime(START_TIME);
                    });

                    it('should return true', async () => {
                        expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.true;
                    });
                });

                context('after a program has ended', () => {
                    beforeEach(async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        );

                        await autoCompoundingStakingRewards.setTime(END_TIME ? END_TIME + 1 : ExponentialDecay.MAX_DURATION + 1);
                    });

                    switch (distributionType) {
                        case StakingRewardsDistributionTypes.Flat:
                            it('should return false', async () => {
                                expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
                            });
                            break;
                        case StakingRewardsDistributionTypes.ExponentialDecay:
                            it('should return true', async () => {
                                expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.true;
                            });
                            break;
                    }
                });
            });

            describe('program data', () => {
                describe('single program', () => {
                    it('should not return a non existent program', async () => {
                        const program = await autoCompoundingStakingRewards.program(token.address);

                        expect(program.poolToken).to.equal(ZERO_ADDRESS);
                    });

                    it('should return an existing program', async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            START_TIME,
                            END_TIME
                        );

                        const program = await autoCompoundingStakingRewards.program(token.address);

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
                            TKN,
                            INITIAL_USER_STAKE,
                            TOTAL_REWARDS
                        ));

                        ({ token: token2, poolToken: poolToken2 } = await prepareSimplePool(
                            TKN,
                            INITIAL_USER_STAKE,
                            TOTAL_REWARDS
                        ));

                        for (const currToken of [token, token1, token2]) {
                            await autoCompoundingStakingRewards.createProgram(
                                currToken.address,
                                currToken.address === networkToken.address
                                    ? masterPool.address
                                    : externalRewardsVault.address,
                                TOTAL_REWARDS,
                                distributionType,
                                START_TIME,
                                END_TIME
                            );
                        }
                    });

                    it('should return multiple programs', async () => {
                        const programs = await autoCompoundingStakingRewards.programs();

                        expect(programs.length).to.equal(3);
                        expect(programs[0].poolToken).to.equal(poolToken.address);
                        expect(programs[1].poolToken).to.equal(poolToken1.address);
                        expect(programs[2].poolToken).to.equal(poolToken2.address);
                    });
                });
            });
        };

        for (const symbol of [BNT, ETH, TKN]) {
            for (const distributionType of [
                StakingRewardsDistributionTypes.Flat,
                StakingRewardsDistributionTypes.ExponentialDecay
            ])
                context(symbol, () => {
                    context(
                        distributionType === StakingRewardsDistributionTypes.Flat ? 'flat' : 'exponential decay',
                        () => {
                            testProgramManagement(symbol, distributionType);
                        }
                    );
                });
        }
    });

    describe('process rewards', () => {
        const testRewards = (
            symbol: string,
            distributionType: StakingRewardsDistributionTypes,
            providerStake: BigNumberish,
            totalRewards: BigNumberish
        ) => {
            const isNetworkToken = symbol === BNT;

            let stakingRewardsMath: TestStakingRewardsMath;
            let token: TokenWithAddress;
            let poolToken: PoolToken;
            let rewardsVault: IVault;

            const MIN_LIQUIDITY_FOR_TRADING = toWei(1_000);

            beforeEach(async () => {
                ({
                    network,
                    networkInfo,
                    networkSettings,
                    networkToken,
                    masterPool,
                    masterPoolToken,
                    poolCollection,
                    externalRewardsVault
                } = await createSystem());

                stakingRewardsMath = await Contracts.TestStakingRewardsMath.deploy();

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                ({ token, poolToken } = await prepareSimplePool(symbol, providerStake, totalRewards));

                rewardsVault = isNetworkToken ? masterPool : externalRewardsVault;

                autoCompoundingStakingRewards = await createStakingRewards(
                    network,
                    networkSettings,
                    networkToken,
                    masterPool,
                    externalRewardsVault
                );
            });

            const getPoolTokenUnderlying = async (user: Addressable) => {
                const userPoolTokenBalance = await poolToken.balanceOf(user.address);

                if (isNetworkToken) {
                    return masterPool.poolTokenToUnderlying(userPoolTokenBalance);
                }

                return poolCollection.poolTokenToUnderlying(token.address, userPoolTokenBalance);
            };

            const getRewards = async (program: any) => {
                const currTime = await autoCompoundingStakingRewards.currentTime();
                const prevTime = program.prevDistributionTimestamp;

                if (!program.isEnabled || program.startTime > currTime) {
                    return { tokenAmountToDistribute: BigNumber.from(0), poolTokenAmountToBurn: BigNumber.from(0), timeElapsed: 0 };
                }

                let currTimeElapsed: number;
                let prevTimeElapsed: number;
                let tokenAmountToDistribute: BigNumber;
                let poolTokenAmountToBurn: BigNumber;

                switch (program.distributionType) {
                    case StakingRewardsDistributionTypes.Flat:
                        currTimeElapsed = Math.min(currTime, program.endTime) - program.startTime;
                        prevTimeElapsed = Math.min(prevTime, program.endTime) - program.startTime;
                        tokenAmountToDistribute = await stakingRewardsMath.calcFlatRewards(
                            program.totalRewards,
                            currTimeElapsed - prevTimeElapsed,
                            program.endTime - program.startTime
                        );

                        break;

                    case StakingRewardsDistributionTypes.ExponentialDecay:
                        currTimeElapsed = currTime - program.startTime;
                        prevTimeElapsed = prevTime - program.startTime;
                        tokenAmountToDistribute = (
                            await stakingRewardsMath.calcExpDecayRewards(program.totalRewards, currTimeElapsed)
                        ).sub(await stakingRewardsMath.calcExpDecayRewards(program.totalRewards, prevTimeElapsed));

                        break;

                    default:
                        throw new Error(`Unsupported type ${program.distributionType}`);
                }

                let poolToken: PoolToken;
                let stakedBalance: BigNumber;
                if (isNetworkToken) {
                    poolToken = masterPoolToken;
                    stakedBalance = await masterPool.stakedBalance();
                } else {
                    poolToken = await Contracts.PoolToken.attach(await poolCollection.poolToken(token.address));
                    ({ stakedBalance } = await poolCollection.poolLiquidity(token.address));
                }

                const protocolPoolTokenAmount = await poolToken.balanceOf(rewardsVault.address);

                const poolTokenSupply = await poolToken.totalSupply();
                const val = tokenAmountToDistribute.mul(poolTokenSupply);

                poolTokenAmountToBurn = val
                    .mul(poolTokenSupply)
                    .div(val.add(stakedBalance.mul(poolTokenSupply.sub(protocolPoolTokenAmount))));

                return { tokenAmountToDistribute, poolTokenAmountToBurn, timeElapsed: currTime - program.startTime };
            };

            const testDistribution = async () => {
                const prevProgram = await autoCompoundingStakingRewards.program(token.address);
                const prevPoolTokenBalance = await poolToken.balanceOf(rewardsVault.address);
                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                const prevUserTokenOwned = await getPoolTokenUnderlying(user);
                const prevExternalRewardsVaultTokenOwned = await getPoolTokenUnderlying(rewardsVault);

                const { tokenAmountToDistribute, poolTokenAmountToBurn, timeElapsed } = await getRewards(prevProgram);

                const res = await autoCompoundingStakingRewards.processRewards(token.address);
                const program = await autoCompoundingStakingRewards.program(token.address);

                if (tokenAmountToDistribute.eq(0) || poolTokenAmountToBurn.eq(0)) {
                    await expect(res).not.to.emit(autoCompoundingStakingRewards, 'RewardsDistributed');

                    expect(program.prevDistributionTimestamp).to.equal(prevProgram.prevDistributionTimestamp);
                } else {
                    await expect(res)
                        .to.emit(autoCompoundingStakingRewards, 'RewardsDistributed')
                        .withArgs(
                            token.address,
                            tokenAmountToDistribute,
                            poolTokenAmountToBurn,
                            timeElapsed,
                            program.remainingRewards
                        );

                    expect(program.prevDistributionTimestamp).to.equal(
                        await autoCompoundingStakingRewards.currentTime()
                    );
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
                    case StakingRewardsDistributionTypes.Flat:
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

                    case StakingRewardsDistributionTypes.ExponentialDecay:
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
                context(StakingRewardsDistributionTypes[distributionType], () => {
                    let startTime: number;

                    beforeEach(async () => {
                        startTime = await latest();

                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            totalRewards,
                            distributionType,
                            startTime,
                            distributionType === StakingRewardsDistributionTypes.Flat ? startTime + programDuration : 0
                        );
                    });

                    describe('basic tests', () => {
                        context('before the beginning of a program', () => {
                            beforeEach(async () => {
                                await autoCompoundingStakingRewards.setTime(startTime - duration.days(1));
                            });

                            it('should not distribute any rewards', async () => {
                                const { tokenAmountToDistribute } = await testDistribution();
                                expect(tokenAmountToDistribute).to.equal(0);
                            });
                        });

                        context('at the beginning of a program', () => {
                            beforeEach(async () => {
                                await autoCompoundingStakingRewards.setTime(startTime);
                            });

                            it('should not distribute any rewards', async () => {
                                const { tokenAmountToDistribute } = await testDistribution();
                                expect(tokenAmountToDistribute).to.equal(0);
                            });
                        });

                        context('at the end of a program', () => {
                            beforeEach(async () => {
                                await autoCompoundingStakingRewards.setTime(startTime + programDuration);
                            });

                            switch (distributionType) {
                                case StakingRewardsDistributionTypes.Flat:
                                    it('should distribute all the rewards', async () => {
                                        const { tokenAmountToDistribute } = await testDistribution();
                                        expect(tokenAmountToDistribute).to.equal(totalRewards);
                                    });

                                    break;

                                case StakingRewardsDistributionTypes.ExponentialDecay:
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
                                await autoCompoundingStakingRewards.setTime(
                                    startTime + programDuration + duration.days(1)
                                );
                            });

                            switch (distributionType) {
                                case StakingRewardsDistributionTypes.Flat:
                                    it('should distribute all the rewards', async () => {
                                        const { tokenAmountToDistribute } = await testDistribution();
                                        expect(tokenAmountToDistribute).to.equal(totalRewards);
                                    });

                                    break;

                                case StakingRewardsDistributionTypes.ExponentialDecay:
                                    it('should revert with an overflow', async () => {
                                        await expect(
                                            autoCompoundingStakingRewards.processRewards(token.address)
                                        ).to.be.revertedWith('Overflow');
                                    });

                                    break;

                                default:
                                    throw new Error(`Unsupported type ${distributionType}`);
                            }
                        });

                        context('while the program is active', () => {
                            beforeEach(async () => {
                                await autoCompoundingStakingRewards.setTime(
                                    startTime + Math.floor(programDuration / 2)
                                );
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
                                    await autoCompoundingStakingRewards.enableProgram(token.address, false);
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
                                        await autoCompoundingStakingRewards.setTime(time);

                                        await testDistribution();
                                    }
                                });
                            }
                        );
                    };

                    switch (distributionType) {
                        case StakingRewardsDistributionTypes.Flat:
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

                        case StakingRewardsDistributionTypes.ExponentialDecay:
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
                case StakingRewardsDistributionTypes.Flat:
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

                case StakingRewardsDistributionTypes.ExponentialDecay:
                    describe('regular tests', () => {
                        testProgram(ExponentialDecay.MAX_DURATION);
                    });

                    break;

                default:
                    throw new Error(`Unsupported type ${distributionType}`);
            }
        };

        const testRewardsMatrix = (providerStakes: BigNumberish[], totalRewards: BigNumberish[]) => {
            const distributionTypes = Object.values(StakingRewardsDistributionTypes).filter(
                (v) => typeof v === 'number'
            ) as number[];

            for (const symbol of [BNT, TKN, ETH]) {
                for (const distributionType of distributionTypes) {
                    for (const providerStake of providerStakes) {
                        for (const totalReward of totalRewards) {
                            context(
                                `total ${totalRewards} ${symbol} rewards, with initial provider stake of ${providerStake}`,
                                () => {
                                    testRewards(symbol, distributionType, providerStake, totalReward);
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
