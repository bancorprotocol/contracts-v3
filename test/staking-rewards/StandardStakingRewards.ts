import Contracts, {
    BancorNetworkInfo,
    ExternalRewardsVault,
    IERC20,
    IPoolToken,
    NetworkSettings,
    TestBancorNetwork,
    TestBNTPool,
    TestPoolCollection,
    TestStandardStakingRewards
} from '../../components/Contracts';
import { TokenGovernance } from '../../components/LegacyContracts';
import { ZERO_ADDRESS } from '../../utils/Constants';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import {
    createStandardStakingRewards,
    createSystem,
    createTestToken,
    createToken,
    setupFundedPool,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';

describe('StandardStakingRewards', () => {
    let deployer: SignerWithAddress;
    let user: SignerWithAddress;

    let network: TestBancorNetwork;
    let networkInfo: BancorNetworkInfo;
    let networkSettings: NetworkSettings;
    let bntGovernance: TokenGovernance;
    let bntPool: TestBNTPool;
    let bnt: IERC20;
    let poolCollection: TestPoolCollection;
    let externalRewardsVault: ExternalRewardsVault;

    let now: number;

    const INITIAL_BALANCE = toWei(10_000);

    shouldHaveGap('StandardStakingRewards', '_nextProgramId');

    before(async () => {
        [deployer, user] = await ethers.getSigners();
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
                balance: initialBalance,
                requestedLiquidity: poolData.isBNT() ? BigNumber.from(initialBalance).mul(1000) : 0,
                bntRate: 1,
                baseTokenRate: 2
            },
            user,
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

    const setTime = async (standardStakingRewards: TestStandardStakingRewards, time: number) => {
        await standardStakingRewards.setTime(time);

        now = time;
    };

    describe('construction', () => {
        beforeEach(async () => {
            ({
                network,
                networkInfo,
                networkSettings,
                bnt,
                bntGovernance,
                bntPool,
                externalRewardsVault,
                poolCollection
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.StandardStakingRewards.deploy(
                    ZERO_ADDRESS,
                    networkSettings.address,
                    bntGovernance.address,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.StandardStakingRewards.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    bntGovernance.address,
                    bntPool.address,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT governance contract', async () => {
            await expect(
                Contracts.StandardStakingRewards.deploy(
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
                Contracts.StandardStakingRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bntGovernance.address,
                    ZERO_ADDRESS,
                    externalRewardsVault.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external rewards vault contract', async () => {
            await expect(
                Contracts.StandardStakingRewards.deploy(
                    network.address,
                    networkSettings.address,
                    bntGovernance.address,
                    bntPool.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to reinitialize', async () => {
            const standardStakingRewards = await createStandardStakingRewards(
                network,
                networkSettings,
                bntGovernance,
                bntPool,
                externalRewardsVault
            );

            await expect(standardStakingRewards.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const standardStakingRewards = await createStandardStakingRewards(
                network,
                networkSettings,
                bntGovernance,
                bntPool,
                externalRewardsVault
            );

            expect(await standardStakingRewards.version()).to.equal(1);

            await expectRoles(standardStakingRewards, Roles.Upgradeable);

            await expectRole(standardStakingRewards, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('management', () => {
        let standardStakingRewards: TestStandardStakingRewards;

        beforeEach(async () => {
            ({
                network,
                networkInfo,
                networkSettings,
                bnt,
                bntGovernance,
                bntPool,
                externalRewardsVault,
                poolCollection
            } = await createSystem());

            standardStakingRewards = await createStandardStakingRewards(
                network,
                networkSettings,
                bntGovernance,
                bntPool,
                externalRewardsVault
            );

            await setTime(standardStakingRewards, now);
        });

        describe('creation', () => {
            const TOTAL_REWARDS = 1000;

            describe('basic tests', () => {
                let pool: TokenWithAddress;
                let rewardsToken: TokenWithAddress;

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
                        standardStakingRewards
                            .connect(user)
                            .createProgram(pool.address, bnt.address, TOTAL_REWARDS, now, now + duration.days(1))
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should revert attempting to create a program with for an invalid pool', async () => {
                    await expect(
                        standardStakingRewards.createProgram(
                            ZERO_ADDRESS,
                            bnt.address,
                            TOTAL_REWARDS,
                            now,
                            now + duration.days(1)
                        )
                    ).to.be.revertedWith('InvalidAddress');

                    const token2 = await createTestToken();

                    await expect(
                        standardStakingRewards.createProgram(
                            token2.address,
                            bnt.address,
                            TOTAL_REWARDS,
                            now,
                            now + duration.days(1)
                        )
                    ).to.be.revertedWith('NotWhitelisted');
                });

                it('should revert attempting to create a program with an invalid reward token', async () => {
                    await expect(
                        standardStakingRewards.createProgram(
                            pool.address,
                            ZERO_ADDRESS,
                            TOTAL_REWARDS,
                            now,
                            now + duration.days(1)
                        )
                    ).to.be.revertedWith('InvalidAddress');
                });

                it('should revert attempting to create a program with an invalid total rewards amount', async () => {
                    await expect(
                        standardStakingRewards.createProgram(pool.address, bnt.address, 0, now, now + duration.days(1))
                    ).to.be.revertedWith('ZeroValue');
                });

                it('should revert attempting to create a program with an invalid duration', async () => {
                    await expect(
                        standardStakingRewards.createProgram(
                            pool.address,
                            bnt.address,
                            TOTAL_REWARDS,
                            now - 1,
                            now + duration.days(1)
                        )
                    ).to.be.revertedWith('InvalidParam');

                    await expect(
                        standardStakingRewards.createProgram(
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

                    startTime = now;
                    endTime = now + duration.weeks(12);
                });

                const testProgram = async (
                    pool: TokenWithAddress,
                    rewardsToken: TokenWithAddress,
                    totalRewards: BigNumberish,
                    startTime: number,
                    endTime: number
                ) => {
                    const id = await standardStakingRewards.nextProgramId();
                    const prevUnclaimedRewards = await standardStakingRewards.unclaimedRewards(rewardsToken.address);

                    expect((await standardStakingRewards.programsIds()).map((id) => id.toNumber())).not.to.include(
                        id.toNumber()
                    );
                    expect(await standardStakingRewards.isProgramActive(id)).to.be.false;
                    expect(await standardStakingRewards.isProgramEnabled(id)).to.be.false;

                    const res = await standardStakingRewards.createProgram(
                        pool.address,
                        rewardsToken.address,
                        totalRewards,
                        startTime,
                        endTime
                    );

                    await expect(res)
                        .to.emit(standardStakingRewards, 'ProgramCreated')
                        .withArgs(pool.address, id, rewardsToken.address, totalRewards, startTime, endTime);

                    expect((await standardStakingRewards.programsIds()).map((id) => id.toNumber())).to.include(
                        id.toNumber()
                    );
                    expect(await standardStakingRewards.isProgramActive(id)).to.be.true;
                    expect(await standardStakingRewards.isProgramEnabled(id)).to.be.true;
                    expect(await standardStakingRewards.unclaimedRewards(rewardsToken.address)).to.equal(
                        prevUnclaimedRewards.add(totalRewards)
                    );

                    const programs = await standardStakingRewards.programs([id]);
                    const program = programs[0];

                    expect(program.id).to.equal(id);
                    expect(program.pool).to.equal(pool.address);
                    expect(program.poolToken).to.equal(poolToken.address);
                    expect(program.rewardsToken).to.equal(rewardsToken.address);
                    expect(program.isEnabled).to.equal(true);
                    expect(program.startTime).to.equal(startTime);
                    expect(program.endTime).to.equal(endTime);
                    expect(program.rewardRate).to.equal(BigNumber.from(totalRewards).div(endTime - startTime));
                };

                if (!rewardsData.isBNT()) {
                    it('should revert when attempting to create a program without providing sufficient rewards', async () => {
                        await expect(
                            standardStakingRewards.createProgram(
                                pool.address,
                                rewardsToken.address,
                                TOTAL_REWARDS + 1,
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
                        id = await standardStakingRewards.nextProgramId();

                        await standardStakingRewards.createProgram(
                            pool.address,
                            rewardsToken.address,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );
                    });

                    it('should revert when attempting to create a program when an active program already exists', async () => {
                        await expect(
                            standardStakingRewards.createProgram(
                                pool.address,
                                rewardsToken.address,
                                TOTAL_REWARDS2,
                                startTime,
                                endTime
                            )
                        ).to.be.revertedWith('ProgramAlreadyExists');
                    });

                    context('after the active program has ended', () => {
                        beforeEach(async () => {
                            await setTime(standardStakingRewards, endTime + 1);
                        });

                        if (!rewardsData.isBNT()) {
                            context('with insufficient additional rewards', () => {
                                it('should revert', async () => {
                                    await expect(
                                        standardStakingRewards.createProgram(
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
                            await standardStakingRewards.terminateProgram(id);
                        });

                        if (!rewardsData.isBNT()) {
                            context('with insufficient additional rewards', () => {
                                it('should revert', async () => {
                                    await expect(
                                        standardStakingRewards.createProgram(
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
            // TODO:
        });
    });
});
