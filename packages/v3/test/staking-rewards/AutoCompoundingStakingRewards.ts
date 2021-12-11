import Contracts from '../../components/Contracts';
import {
    NetworkSettings,
    BancorNetworkInformation,
    PoolToken,
    IERC20,
    TestBancorNetwork,
    TestMasterPool,
    TestPoolCollection,
    TestAutoCompoundingStakingRewards,
    ExternalRewardsVault
} from '../../typechain-types';
import { expectRole, roles } from '../helpers/AccessControl';
import { StackingRewardsDistributionTypes, TKN, ZERO_ADDRESS } from '../helpers/Constants';
import { createStakingRewardsWithERV, createSystem, depositToPool, setupSimplePool } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { OnChainObjectWithAddress, TokenWithAddress, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';

const { days } = duration;

const { Upgradeable: UpgradeableRoles } = roles;

describe('AutoCompoundingStakingRewards', () => {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let stakingRewardsProvider: SignerWithAddress;

    let network: TestBancorNetwork;
    let networkInformation: BancorNetworkInformation;
    let networkSettings: NetworkSettings;
    let masterPool: TestMasterPool;
    let networkToken: IERC20;
    let poolCollection: TestPoolCollection;
    let externalRewardsVault: ExternalRewardsVault;

    let autoCompoundingStakingRewards: TestAutoCompoundingStakingRewards;

    const INITIAL_RATE = { n: 1, d: 2 };

    shouldHaveGap('AutoCompoundingStakingRewards', '_programs');

    before(async () => {
        [deployer, user, stakingRewardsProvider] = await ethers.getSigners();
    });

    const assertAccuracy = (actual: BigNumber, expected: BigNumber, minAccuracy: string) => {
        const actualDec = new Decimal(actual.toString());
        const expectedDec = new Decimal(expected.toString());

        if (!actualDec.eq(expectedDec)) {
            const accuracy = actualDec.gt(expectedDec) ? expectedDec.div(actualDec) : actualDec.div(expectedDec);
            expect(accuracy.gte(new Decimal(minAccuracy)) && accuracy.lte(1)).to.equal(
                true,
                '\n' +
                    [
                        `expected = ${expectedDec}`,
                        `actual   = ${actualDec}`,
                        `accuracy = ${accuracy.toFixed(minAccuracy.length)}`
                    ].join('\n')
            );
        }
    };

    const setupSimplePoolAndTransferPoolTokenForProgramCreation = async (
        initialStake: BigNumberish,
        totalRewards: BigNumberish
    ) => {
        const { token, poolToken } = await setupSimplePool(
            {
                symbol: TKN,
                balance: initialStake,
                initialRate: INITIAL_RATE
            },
            user,
            network,
            networkInformation,
            networkSettings,
            poolCollection
        );

        await depositAndTransferToERV(
            stakingRewardsProvider,
            token,
            poolToken,
            totalRewards,
            network,
            externalRewardsVault
        );

        return { token, poolToken };
    };

    const depositAndTransferToERV = async (
        lp: SignerWithAddress,
        token: TokenWithAddress,
        poolToken: TokenWithAddress,
        amount: BigNumberish,
        network: TestBancorNetwork,
        externalRewardsVault: ExternalRewardsVault
    ) => {
        await depositToPool(lp, token, amount, network);
        await transfer(lp, poolToken, externalRewardsVault, amount);
    };

    describe('construction', () => {
        beforeEach(async () => {
            ({ network, networkSettings, networkToken, masterPool, poolCollection, externalRewardsVault } =
                await createSystem());

            autoCompoundingStakingRewards = await createStakingRewardsWithERV(
                network,
                networkToken,
                masterPool,
                externalRewardsVault
            );
        });

        it('should revert when attempting to create with an invalid bancor network contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(ZERO_ADDRESS, networkToken.address, masterPool.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network token contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(network.address, ZERO_ADDRESS, masterPool.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master pool contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(network.address, networkToken.address, ZERO_ADDRESS)
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

    describe('program', () => {
        let now: number;
        let endTime: number;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));
        const TOTAL_DURATION = days(10);
        const TOTAL_REWARDS = 10;
        const INITIAL_STAKE = 10;

        let token: TokenWithAddress;
        let poolToken: TokenWithAddress;

        beforeEach(async () => {
            ({ network, networkSettings, networkToken, masterPool, poolCollection, externalRewardsVault } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            now = 0;
            endTime = now + TOTAL_DURATION;

            autoCompoundingStakingRewards = await createStakingRewardsWithERV(
                network,
                networkToken,
                masterPool,
                externalRewardsVault
            );

            ({ token, poolToken } = await setupSimplePoolAndTransferPoolTokenForProgramCreation(
                INITIAL_STAKE,
                TOTAL_REWARDS
            ));
        });

        describe('program creation', () => {
            it('should revert when reserve token is invalid', async () => {
                await expect(
                    autoCompoundingStakingRewards.createProgram(
                        ZERO_ADDRESS,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        now,
                        endTime
                    )
                ).to.revertedWith('InvalidAddress');
            });

            it('should revert when rewards vault contract is invalid', async () => {
                await expect(
                    autoCompoundingStakingRewards.createProgram(
                        token.address,
                        ZERO_ADDRESS,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        now,
                        endTime
                    )
                ).to.revertedWith('InvalidAddress');
            });

            it('should revert when there is already an active program', async () => {
                await autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    TOTAL_REWARDS,
                    StackingRewardsDistributionTypes.Flat,
                    now,
                    endTime
                );

                await expect(
                    autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        now,
                        endTime
                    )
                ).to.revertedWith('ProgramAlreadyActive');
            });

            it('should revert when total rewards is equal to 0', async () => {
                await expect(
                    autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        0,
                        StackingRewardsDistributionTypes.Flat,
                        now,
                        endTime
                    )
                ).to.revertedWith('InvalidParam');
            });

            it('should revert when start time is higher than end time', async () => {
                await expect(
                    autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        endTime,
                        now
                    )
                ).to.be.revertedWith('InvalidParam');
            });

            it('should revert when start time is lower than current time', async () => {
                await autoCompoundingStakingRewards.setTime(1);

                await expect(
                    autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        0,
                        endTime
                    )
                ).to.revertedWith('InvalidParam');
            });

            it('should revert when there is not enough funds in the external rewards vault', async () => {
                await expect(
                    autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS + 1,
                        StackingRewardsDistributionTypes.Flat,
                        0,
                        endTime
                    )
                ).to.revertedWith('InsufficientFunds');
            });

            it('should create the program', async () => {
                const res = await autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    TOTAL_REWARDS,
                    StackingRewardsDistributionTypes.Flat,
                    now,
                    endTime
                );

                await expect(res)
                    .to.emit(autoCompoundingStakingRewards, 'ProgramCreated')
                    .withArgs(token.address, externalRewardsVault.address, TOTAL_REWARDS, 0, now, endTime);

                const program = await autoCompoundingStakingRewards.program(token.address);

                expect(program.poolToken).to.equal(poolToken.address);
                expect(program.rewardsVault).to.equal(externalRewardsVault.address);
                expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                expect(program.availableRewards).to.equal(TOTAL_REWARDS);
                expect(program.distributionType).to.equal(StackingRewardsDistributionTypes.Flat);
                expect(program.startTime).to.equal(now);
                expect(program.endTime).to.equal(endTime);
                expect(program.prevDistributionTimestamp).to.equal(0);
                expect(program.isEnabled).to.be.true;
            });
        });

        describe('program termination', () => {
            context('when program is inactive', () => {
                it('should revert when program is inactive', async () => {
                    await expect(autoCompoundingStakingRewards.terminateProgram(token.address)).to.revertedWith(
                        'ProgramInactive'
                    );
                });
            });

            context('when program is active', () => {
                beforeEach(async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        now,
                        endTime
                    );
                });

                it('should terminate the program', async () => {
                    const newEndTime = now + 1;

                    await autoCompoundingStakingRewards.setTime(newEndTime);

                    const res = autoCompoundingStakingRewards.terminateProgram(token.address);

                    await expect(res)
                        .to.emit(autoCompoundingStakingRewards, 'ProgramTerminated')
                        .withArgs(token.address, newEndTime, 10);

                    const program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.poolToken).to.equal(poolToken.address);
                    expect(program.rewardsVault).to.equal(externalRewardsVault.address);
                    expect(program.totalRewards).to.equal(10);
                    expect(program.availableRewards).to.equal(0);
                    expect(program.distributionType).to.equal(StackingRewardsDistributionTypes.Flat);
                    expect(program.startTime).to.equal(now);
                    expect(program.endTime).to.equal(newEndTime);
                    expect(program.prevDistributionTimestamp).to.equal(0);
                    expect(program.isEnabled).to.be.true;
                });
            });
        });

        describe('program enable / disable', () => {
            beforeEach(async () => {
                await autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    TOTAL_REWARDS,
                    StackingRewardsDistributionTypes.Flat,
                    now + 1,
                    endTime
                );
            });

            it('should correctly enable a program', async () => {
                await expect(autoCompoundingStakingRewards.enableProgram(token.address, true))
                    .to.emit(autoCompoundingStakingRewards, 'ProgramEnabled')
                    .withArgs(token.address, true, TOTAL_REWARDS);
            });

            it('should correctly disable a program', async () => {
                await expect(autoCompoundingStakingRewards.enableProgram(token.address, false))
                    .to.emit(autoCompoundingStakingRewards, 'ProgramEnabled')
                    .withArgs(token.address, false, TOTAL_REWARDS);
            });
        });

        describe('program status', () => {
            context('when program is non-existent', () => {
                it('should return false when program is non-existent', async () => {
                    expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
                });
            });

            context("when program hasn't started", () => {
                beforeEach(async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        now + 1,
                        endTime
                    );
                });

                it("should return false if program hasn't started", async () => {
                    expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
                });
            });

            context('when the program end time has passed', () => {
                beforeEach(async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        now,
                        endTime
                    );

                    await autoCompoundingStakingRewards.setTime(endTime + 1);
                });

                it('should return false when program has ended', async () => {
                    expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
                });
            });

            context('when the program is active', () => {
                beforeEach(async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        now,
                        endTime
                    );
                });

                it('should return true when program is active', async () => {
                    expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.true;
                });
            });
        });

        describe('query program data', () => {
            describe('single program', () => {
                it('shouldnt be able to fetch an empty program', async () => {
                    const program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.poolToken).to.equal(ZERO_ADDRESS);
                });

                it('should correctly fetch an existing program program', async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        StackingRewardsDistributionTypes.Flat,
                        now,
                        endTime
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
                    ({ token: token1, poolToken: poolToken1 } =
                        await setupSimplePoolAndTransferPoolTokenForProgramCreation(INITIAL_STAKE, TOTAL_REWARDS));

                    ({ token: token2, poolToken: poolToken2 } =
                        await setupSimplePoolAndTransferPoolTokenForProgramCreation(INITIAL_STAKE, TOTAL_REWARDS));

                    for (const currToken of [token, token1, token2]) {
                        await autoCompoundingStakingRewards.createProgram(
                            currToken.address,
                            externalRewardsVault.address,
                            TOTAL_REWARDS,
                            StackingRewardsDistributionTypes.Flat,
                            now,
                            endTime
                        );
                    }
                });

                it('should return multiples program', async () => {
                    const programs = await autoCompoundingStakingRewards.programs();

                    expect(programs.length).to.equal(3);
                    expect(programs[0].poolToken).to.equal(poolToken.address);
                    expect(programs[1].poolToken).to.equal(poolToken1.address);
                    expect(programs[2].poolToken).to.equal(poolToken2.address);
                });
            });
        });
    });

    describe('process rewards', () => {
        const tokenFromPoolToken = async (
            user: OnChainObjectWithAddress,
            poolCollection: TestPoolCollection,
            token: TokenWithAddress,
            poolToken: PoolToken
        ) => {
            const tokenStakedBalance = (await poolCollection.poolLiquidity(token.address)).stakedBalance;
            return (await poolToken.balanceOf(user.address)).mul(tokenStakedBalance).div(await poolToken.totalSupply());
        };

        function getPerc(num: number, percent: number): number;
        function getPerc(num: BigNumber, percent: number): BigNumber;

        function getPerc(num: number | BigNumber, percent: number): number | BigNumber {
            if (typeof num === 'number') {
                return num - Math.floor(num - (percent / 100) * num);
            }
            return num.sub(num.sub(num.mul(percent).div(100)));
        }

        context('FLAT', () => {
            const distributionType = StackingRewardsDistributionTypes.Flat;

            const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));

            const INITIAL_STAKE = toWei(BigNumber.from(10_000));
            const TOTAL_REWARDS = toWei(BigNumber.from(90_000));
            const TOTAL_TOKEN = INITIAL_STAKE.add(TOTAL_REWARDS);
            const PROGRAM_TIME = days(10);

            let now: BigNumber;

            let token: TokenWithAddress;
            let poolToken: PoolToken;

            beforeEach(async () => {
                ({ network, networkSettings, networkToken, masterPool, poolCollection, externalRewardsVault } =
                    await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                autoCompoundingStakingRewards = await createStakingRewardsWithERV(
                    network,
                    networkToken,
                    masterPool,
                    externalRewardsVault
                );

                now = BigNumber.from(0);

                ({ token, poolToken } = await setupSimplePoolAndTransferPoolTokenForProgramCreation(
                    INITIAL_STAKE,
                    TOTAL_REWARDS
                ));

                await autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    TOTAL_REWARDS,
                    distributionType,
                    now,
                    now.add(PROGRAM_TIME)
                );
            });

            describe('basic tests', () => {
                it('should not have distributed any rewards at the beginning of a program', async () => {
                    await autoCompoundingStakingRewards.processRewards(token.address);

                    const userTokenOwned = await tokenFromPoolToken(user, poolCollection, token, poolToken);
                    const externalRewardsVaultTokenOwned = await tokenFromPoolToken(
                        externalRewardsVault,
                        poolCollection,
                        token,
                        poolToken
                    );

                    expect(userTokenOwned).to.equal(INITIAL_STAKE);
                    expect(externalRewardsVaultTokenOwned).to.equal(TOTAL_REWARDS);
                });

                it('should have distributed all rewards at the end of a program', async () => {
                    await autoCompoundingStakingRewards.setTime(PROGRAM_TIME);
                    await autoCompoundingStakingRewards.processRewards(token.address);

                    const userTokenOwned = await tokenFromPoolToken(user, poolCollection, token, poolToken);
                    const externalRewardsVaultTokenOwned = await tokenFromPoolToken(
                        externalRewardsVault,
                        poolCollection,
                        token,
                        poolToken
                    );

                    expect(userTokenOwned).to.equal(TOTAL_TOKEN);
                    expect(externalRewardsVaultTokenOwned).to.equal(BigNumber.from(0));
                });
            });

            describe('advanced tests', () => {
                for (const programTimePercent of [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
                    const now = getPerc(PROGRAM_TIME, programTimePercent);

                    it(`should have distributed ${programTimePercent}% of all rewards at ${programTimePercent}% of a program`, async () => {
                        await autoCompoundingStakingRewards.setTime(now);
                        await autoCompoundingStakingRewards.processRewards(token.address);

                        const userTokenOwned = await tokenFromPoolToken(user, poolCollection, token, poolToken);
                        const externalRewardsVaultTokenOwned = await tokenFromPoolToken(
                            externalRewardsVault,
                            poolCollection,
                            token,
                            poolToken
                        );

                        assertAccuracy(
                            userTokenOwned,
                            INITIAL_STAKE.add(getPerc(TOTAL_REWARDS, programTimePercent)),
                            '0.999999999999999999999'
                        );

                        assertAccuracy(
                            externalRewardsVaultTokenOwned,
                            getPerc(TOTAL_REWARDS, 100 - programTimePercent),
                            '0.999999999999999999999'
                        );
                    });
                }
            });
        });
    });
});
