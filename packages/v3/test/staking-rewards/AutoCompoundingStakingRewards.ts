import Contracts from '../../components/Contracts';
import {
    BancorNetworkInformation,
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
import { StakingRewardsDistributionTypes, BNT, ETH, TKN, ZERO_ADDRESS, ExponentialDecay } from '../helpers/Constants';
import { createStakingRewards, createSystem, depositToPool, setupSimplePool } from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { latest, duration } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { Addressable, createTokenBySymbol, TokenWithAddress, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import humanizeDuration from 'humanize-duration';

const { days } = duration;
const { ONE, LAMBDA } = ExponentialDecay;

const { Upgradeable: UpgradeableRoles } = roles;

describe('AutoCompoundingStakingRewards', () => {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;
    let stakingRewardsProvider: SignerWithAddress;

    let network: TestBancorNetwork;
    let networkInformation: BancorNetworkInformation;
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

    const prepareSimplePool = async (symbol: string, initialStake: BigNumberish, totalRewards: BigNumberish) => {
        // deposit initial stake so that the participating user would have some initial amount of pool tokens
        const { token, poolToken } = await setupSimplePool(
            {
                symbol,
                balance: initialStake,
                initialRate: { n: 1, d: 2 }
            },
            user,
            network,
            networkInformation,
            networkSettings,
            poolCollection
        );

        // if we're rewarding the network token - no additional if funding is needed
        if (symbol !== BNT) {
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

            let now: number;
            let endTime: number;

            const MIN_LIQUIDITY_FOR_TRADING = toWei(1_000);
            const TOTAL_DURATION = days(10);
            const TOTAL_REWARDS = 10;
            const INITIAL_USER_STAKE = 10;

            beforeEach(async () => {
                ({
                    network,
                    networkInformation,
                    networkSettings,
                    networkToken,
                    masterPool,
                    poolCollection,
                    externalRewardsVault
                } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                now = 0;
                endTime = distributionType === StakingRewardsDistributionTypes.Flat ? now + TOTAL_DURATION : 0;

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
                                now,
                                endTime
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
                            now,
                            endTime
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
                            now,
                            endTime
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
                            now,
                            endTime
                        )
                    ).to.revertedWith('InvalidParam');
                });

                it('should revert when there is already an active program', async () => {
                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        rewardsVault.address,
                        TOTAL_REWARDS,
                        distributionType,
                        now,
                        endTime
                    );

                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            now,
                            endTime
                        )
                    ).to.revertedWith('ProgramAlreadyActive');
                });

                it('should revert when the total rewards are equal to 0', async () => {
                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            0,
                            distributionType,
                            now,
                            endTime
                        )
                    ).to.revertedWith('InvalidParam');
                });

                if (distributionType === StakingRewardsDistributionTypes.Flat) {
                    it('should revert when the start time is higher than the end time', async () => {
                        await expect(
                            autoCompoundingStakingRewards.createProgram(
                                token.address,
                                rewardsVault.address,
                                TOTAL_REWARDS,
                                distributionType,
                                endTime,
                                now
                            )
                        ).to.be.revertedWith('InvalidParam');
                    });

                    it('should revert when the end time is equal to 0', async () => {
                        await expect(
                            autoCompoundingStakingRewards.createProgram(
                                token.address,
                                rewardsVault.address,
                                TOTAL_REWARDS,
                                distributionType,
                                now,
                                0
                            )
                        ).to.be.revertedWith('InvalidParam');
                    });
                } else {
                    it('should revert when the end time is not equal to 0', async () => {
                        await expect(
                            autoCompoundingStakingRewards.createProgram(
                                token.address,
                                rewardsVault.address,
                                TOTAL_REWARDS,
                                distributionType,
                                now,
                                1
                            )
                        ).to.be.revertedWith('InvalidParam');
                    });
                }

                it('should revert when the start time is lower than the current time', async () => {
                    await autoCompoundingStakingRewards.setTime(1);

                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            0,
                            endTime
                        )
                    ).to.revertedWith('InvalidParam');
                });

                it('should revert when the pool is not whitelisted', async () => {
                    const nonWhitelistedToken = await createTokenBySymbol(TKN);

                    await expect(
                        autoCompoundingStakingRewards.createProgram(
                            nonWhitelistedToken.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            now,
                            endTime
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
                            0,
                            endTime
                        )
                    ).to.revertedWith('InsufficientFunds');
                });

                it('should create the program', async () => {
                    const res = await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        rewardsVault.address,
                        TOTAL_REWARDS,
                        distributionType,
                        now,
                        endTime
                    );

                    await expect(res)
                        .to.emit(autoCompoundingStakingRewards, 'ProgramCreated')
                        .withArgs(token.address, rewardsVault.address, TOTAL_REWARDS, distributionType, now, endTime);

                    const program = await autoCompoundingStakingRewards.program(token.address);

                    expect(program.poolToken).to.equal(poolToken.address);
                    expect(program.rewardsVault).to.equal(rewardsVault.address);
                    expect(program.totalRewards).to.equal(TOTAL_REWARDS);
                    expect(program.remainingRewards).to.equal(TOTAL_REWARDS);
                    expect(program.distributionType).to.equal(distributionType);
                    expect(program.startTime).to.equal(now);
                    expect(program.endTime).to.equal(endTime);
                    expect(program.prevDistributionTimestamp).to.equal(0);
                    expect(program.isEnabled).to.be.true;
                });
            });

            describe('termination', () => {
                it('should revert when a non-admin attempts to terminate a program', async () => {
                    await expect(
                        autoCompoundingStakingRewards.connect(user).terminateProgram(token.address)
                    ).to.be.revertedWith('AccessDenied');
                });

                context('when a program is inactive', () => {
                    it('should revert', async () => {
                        await expect(autoCompoundingStakingRewards.terminateProgram(token.address)).to.revertedWith(
                            'ProgramInactive'
                        );
                    });
                });

                context('when a program is active', () => {
                    beforeEach(async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
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
                        expect(program.rewardsVault).to.equal(rewardsVault.address);
                        expect(program.totalRewards).to.equal(10);
                        expect(program.remainingRewards).to.equal(0);
                        expect(program.distributionType).to.equal(distributionType);
                        expect(program.startTime).to.equal(now);
                        expect(program.endTime).to.equal(newEndTime);
                        expect(program.prevDistributionTimestamp).to.equal(0);
                        expect(program.isEnabled).to.be.true;
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
                        now + 1,
                        endTime
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

            describe('is program active', () => {
                context('when a program does not exist', () => {
                    it('should return false', async () => {
                        expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
                    });
                });

                context("when a program hasn't started", () => {
                    beforeEach(async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            now + 1,
                            endTime
                        );
                    });

                    it('should return false', async () => {
                        expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
                    });
                });

                context('when a program is active', () => {
                    beforeEach(async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
                            now,
                            endTime
                        );
                    });

                    it('should return true', async () => {
                        expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.true;
                    });
                });

                if (distributionType === StakingRewardsDistributionTypes.Flat) {
                    context('when a program has finished', () => {
                        beforeEach(async () => {
                            await autoCompoundingStakingRewards.createProgram(
                                token.address,
                                rewardsVault.address,
                                TOTAL_REWARDS,
                                distributionType,
                                now,
                                endTime
                            );

                            await autoCompoundingStakingRewards.setTime(endTime + 1);
                        });

                        it('should return false', async () => {
                            expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
                        });
                    });
                }
            });

            describe('query program data', () => {
                describe('single program', () => {
                    it('should query a non-existing program', async () => {
                        const program = await autoCompoundingStakingRewards.program(token.address);

                        expect(program.poolToken).to.equal(ZERO_ADDRESS);
                    });

                    it('should correctly query an existing program', async () => {
                        await autoCompoundingStakingRewards.createProgram(
                            token.address,
                            rewardsVault.address,
                            TOTAL_REWARDS,
                            distributionType,
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
                                now,
                                endTime
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
        const testRewards = (symbol: string) => {
            const isNetworkToken = symbol === BNT;

            let token: TokenWithAddress;
            let poolToken: PoolToken;
            let rewardsVault: IVault;

            const MIN_LIQUIDITY_FOR_TRADING = toWei(1_000);
            const INITIAL_USER_STAKE = toWei(10_000);
            const TOTAL_REWARDS = toWei(90_000);

            beforeEach(async () => {
                ({
                    network,
                    networkInformation,
                    networkSettings,
                    networkToken,
                    masterPool,
                    masterPoolToken,
                    poolCollection,
                    externalRewardsVault
                } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                ({ token, poolToken } = await prepareSimplePool(symbol, INITIAL_USER_STAKE, TOTAL_REWARDS));

                rewardsVault = isNetworkToken ? masterPool : externalRewardsVault;
            });

            const getPoolTokenUnderlying = async (user: Addressable) => {
                const userPoolTokenBalance = await poolToken.balanceOf(user.address);

                if (isNetworkToken) {
                    return masterPool.poolTokenToUnderlying(userPoolTokenBalance);
                }

                return poolCollection.poolTokenToUnderlying(token.address, userPoolTokenBalance);
            };

            const getExponentialDecayRewardsAfterTimeElapsed = (timeElapsed: number, totalRewards: BigNumber) =>
                new Decimal(totalRewards.toString()).mul(ONE.sub(LAMBDA.neg().mul(timeElapsed).exp()));

            const getRewards = async (pool: TokenWithAddress) => {
                let tokenAmountToDistribute = BigNumber.from(0);
                let poolTokenAmountToBurn = BigNumber.from(0);
                let timeElapsed = 0;

                const program = await autoCompoundingStakingRewards.program(pool.address);
                const duration = program.endTime - program.startTime;
                const currentTime = await autoCompoundingStakingRewards.currentTime();
                if (!program.isEnabled || currentTime < program.startTime) {
                    return { tokenAmountToDistribute, poolTokenAmountToBurn, timeElapsed };
                }

                timeElapsed = currentTime - program.startTime;
                if (program.distributionType === StakingRewardsDistributionTypes.Flat) {
                    timeElapsed = Math.min(timeElapsed, duration);
                }

                const prevTimeElapsed = Math.max(program.prevDistributionTimestamp - program.startTime, 0);

                switch (program.distributionType) {
                    case StakingRewardsDistributionTypes.Flat:
                        tokenAmountToDistribute = program.remainingRewards
                            .mul(timeElapsed - prevTimeElapsed)
                            .div(duration - prevTimeElapsed);

                        break;

                    case StakingRewardsDistributionTypes.ExponentialDecay:
                        tokenAmountToDistribute = BigNumber.from(
                            getExponentialDecayRewardsAfterTimeElapsed(timeElapsed, program.totalRewards)
                                .sub(getExponentialDecayRewardsAfterTimeElapsed(prevTimeElapsed, program.totalRewards))
                                .toFixed(0)
                        );

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
                    poolToken = await Contracts.PoolToken.attach(await poolCollection.poolToken(pool.address));
                    ({ stakedBalance } = await poolCollection.poolLiquidity(pool.address));
                }

                const protocolPoolTokenAmount = await poolToken.balanceOf(rewardsVault.address);

                const poolTokenSupply = await poolToken.totalSupply();
                const val = tokenAmountToDistribute.mul(await poolToken.totalSupply());

                poolTokenAmountToBurn = val
                    .mul(poolTokenSupply)
                    .div(val.add(stakedBalance.mul(poolTokenSupply.sub(protocolPoolTokenAmount))));

                return { tokenAmountToDistribute, poolTokenAmountToBurn, timeElapsed };
            };

            const testDistribution = async () => {
                const prevPoolTokenBalance = await poolToken.balanceOf(rewardsVault.address);
                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                const prevUserTokenOwned = await getPoolTokenUnderlying(user);
                const prevExternalRewardsVaultTokenOwned = await getPoolTokenUnderlying(rewardsVault);

                const { tokenAmountToDistribute, poolTokenAmountToBurn, timeElapsed } = await getRewards(token);

                const res = await autoCompoundingStakingRewards.processRewards(token.address);

                if (tokenAmountToDistribute.eq(BigNumber.from(0)) || poolTokenAmountToBurn.eq(BigNumber.from(0))) {
                    await expect(res).not.to.emit(autoCompoundingStakingRewards, 'RewardsDistributed');
                } else {
                    await expect(res)
                        .to.emit(autoCompoundingStakingRewards, 'RewardsDistributed')
                        .withArgs(
                            token.address,
                            tokenAmountToDistribute,
                            poolTokenAmountToBurn,
                            timeElapsed,
                            TOTAL_REWARDS.sub(tokenAmountToDistribute)
                        );
                }

                expect(await poolToken.balanceOf(rewardsVault.address)).to.equal(
                    prevPoolTokenBalance.sub(poolTokenAmountToBurn)
                );
                expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply.sub(poolTokenAmountToBurn));

                const { distributionType } = await autoCompoundingStakingRewards.program(token.address);
                switch (distributionType) {
                    case StakingRewardsDistributionTypes.Flat:
                        expect(await getPoolTokenUnderlying(user)).to.be.closeTo(
                            prevUserTokenOwned.add(tokenAmountToDistribute),
                            1
                        );
                        expect(await getPoolTokenUnderlying(rewardsVault)).to.be.closeTo(
                            prevExternalRewardsVaultTokenOwned.sub(tokenAmountToDistribute),
                            1
                        );

                        break;

                    case StakingRewardsDistributionTypes.ExponentialDecay:
                        expect(await getPoolTokenUnderlying(user)).be.almostEqual(
                            prevUserTokenOwned.add(tokenAmountToDistribute),
                            {
                                maxRelativeError: new Decimal('0.0000002')
                            }
                        );

                        expect(await getPoolTokenUnderlying(rewardsVault)).to.be.almostEqual(
                            prevExternalRewardsVaultTokenOwned.sub(tokenAmountToDistribute),
                            {
                                maxRelativeError: new Decimal('0.0000002')
                            }
                        );

                        break;

                    default:
                        throw new Error(`Unsupported type ${distributionType}`);
                }

                return { tokenAmountToDistribute };
            };

            context('flat', () => {
                const PROGRAM_DURATION = days(10);

                let startTime: number;
                let endTime: number;

                beforeEach(async () => {
                    autoCompoundingStakingRewards = await createStakingRewards(
                        network,
                        networkSettings,
                        networkToken,
                        masterPool,
                        externalRewardsVault
                    );

                    startTime = await latest();
                    endTime = startTime + PROGRAM_DURATION;

                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        rewardsVault.address,
                        TOTAL_REWARDS,
                        StakingRewardsDistributionTypes.Flat,
                        startTime,
                        endTime
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
                            await autoCompoundingStakingRewards.setTime(startTime + PROGRAM_DURATION);
                        });

                        it('should distribute all the rewards', async () => {
                            const { tokenAmountToDistribute } = await testDistribution();
                            expect(tokenAmountToDistribute).to.equal(TOTAL_REWARDS);
                        });
                    });

                    context('after the end of a program', () => {
                        beforeEach(async () => {
                            await autoCompoundingStakingRewards.setTime(
                                startTime + PROGRAM_DURATION + duration.days(1)
                            );
                        });

                        it('should distribute all the rewards', async () => {
                            const { tokenAmountToDistribute } = await testDistribution();
                            expect(tokenAmountToDistribute).to.equal(TOTAL_REWARDS);
                        });
                    });

                    context('while the program is active', () => {
                        beforeEach(async () => {
                            await autoCompoundingStakingRewards.setTime(startTime + PROGRAM_DURATION / 2);
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

                describe('single distribution', () => {
                    const testSingleDistribution = (step: number) => {
                        context(`in ${step}% steps`, () => {
                            for (let programTimePercent = 0; programTimePercent < 100; programTimePercent += step) {
                                context(`at ${programTimePercent}% of a program`, () => {
                                    beforeEach(async () => {
                                        await autoCompoundingStakingRewards.setTime(
                                            (PROGRAM_DURATION * programTimePercent) / 100
                                        );
                                    });

                                    it('should distribute rewards', async () => {
                                        await testDistribution();
                                    });
                                });
                            }
                        });
                    };

                    for (const step of [5, 10, 25]) {
                        testSingleDistribution(step);
                    }
                });

                describe('multiple distributions', () => {
                    const testMultipleDistributions = (step: number) => {
                        context(`in ${step}% steps`, () => {
                            it('should distribute rewards', async () => {
                                for (let programTimePercent = 0; programTimePercent < 100; programTimePercent += step) {
                                    await autoCompoundingStakingRewards.setTime(
                                        (PROGRAM_DURATION * programTimePercent) / 100
                                    );

                                    await testDistribution();
                                }
                            });
                        });
                    };

                    for (const step of [5, 10, 25]) {
                        testMultipleDistributions(step);
                    }
                });
            });

            context('exponential decay', () => {
                const ESTIMATED_PROGRAM_DURATION = duration.years(35.5);

                let startTime: number;

                beforeEach(async () => {
                    autoCompoundingStakingRewards = await createStakingRewards(
                        network,
                        networkSettings,
                        networkToken,
                        masterPool,
                        externalRewardsVault
                    );

                    startTime = await latest();

                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        rewardsVault.address,
                        TOTAL_REWARDS,
                        StakingRewardsDistributionTypes.ExponentialDecay,
                        startTime,
                        0
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
                            await autoCompoundingStakingRewards.setTime(startTime + ESTIMATED_PROGRAM_DURATION);
                        });

                        it('should distribute all the rewards', async () => {
                            const { tokenAmountToDistribute } = await testDistribution();
                            expect(tokenAmountToDistribute).to.be.almostEqual(TOTAL_REWARDS, {
                                maxRelativeError: new Decimal('0.0000002')
                            });
                        });
                    });

                    context('after the end of a program', () => {
                        beforeEach(async () => {
                            await autoCompoundingStakingRewards.setTime(
                                startTime + ESTIMATED_PROGRAM_DURATION + duration.days(1)
                            );
                        });

                        it('should distribute all the rewards', async () => {
                            const { tokenAmountToDistribute } = await testDistribution();
                            expect(tokenAmountToDistribute).to.be.almostEqual(TOTAL_REWARDS, {
                                maxRelativeError: new Decimal('0.0000002')
                            });
                        });
                    });

                    context('while the program is active', () => {
                        beforeEach(async () => {
                            await autoCompoundingStakingRewards.setTime(startTime + duration.years(1));
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

                describe('single distribution', () => {
                    const testSingleDistribution = (step: number, totalSteps: number) => {
                        context(`in ${totalSteps} steps of ${humanizeDuration(step * 1000)} long steps`, () => {
                            for (let i = 0, time = 0; i < totalSteps; i++, time += step) {
                                context(`after ${humanizeDuration(time * 1000)}`, () => {
                                    beforeEach(async () => {
                                        await autoCompoundingStakingRewards.setTime(time);
                                    });

                                    it('should distribute rewards', async () => {
                                        await testDistribution();
                                    });
                                });
                            }
                        });
                    };

                    for (const step of [duration.hours(1), duration.days(1), duration.weeks(1)]) {
                        for (const totalSteps of [50]) {
                            testSingleDistribution(step, totalSteps);
                        }
                    }
                });

                describe('multiple distributions', () => {
                    const testMultipleDistributions = (step: number, totalSteps: number) => {
                        context(`in ${totalSteps} steps of ${humanizeDuration(step * 1000)} long steps`, () => {
                            it('should distribute rewards', async () => {
                                for (let i = 0, time = 0; i < totalSteps; i++, time += step) {
                                    await autoCompoundingStakingRewards.setTime(time);

                                    await testDistribution();
                                }
                            });
                        });
                    };

                    for (const step of [duration.hours(1), duration.days(1), duration.weeks(1)]) {
                        for (const totalSteps of [50]) {
                            testMultipleDistributions(step, totalSteps);
                        }
                    }
                });
            });
        };

        for (const symbol of [BNT, TKN, ETH]) {
            context(symbol, () => {
                testRewards(symbol);
            });
        }
    });
});