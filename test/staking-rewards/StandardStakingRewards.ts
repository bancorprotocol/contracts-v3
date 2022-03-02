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
import { MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS } from '../../utils/Constants';
import { permitSignature } from '../../utils/Permit';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toPPM, toWei } from '../../utils/Types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import {
    createStandardStakingRewards,
    createSystem,
    createTestToken,
    createToken,
    depositToPool,
    setupFundedPool,
    TokenWithAddress
} from '../helpers/Factory';
import { shouldHaveGap } from '../helpers/Proxy';
import { duration, latest } from '../helpers/Time';
import { createWallet, getBalance, getTransactionCost, min, transfer } from '../helpers/Utils';
import { Relation } from '../matchers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish, Wallet } from 'ethers';
import { ethers } from 'hardhat';
import humanizeDuration from 'humanize-duration';

describe('StandardStakingRewards', () => {
    let deployer: SignerWithAddress;

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
                balance: initialBalance,
                requestedLiquidity: poolData.isBNT() ? BigNumber.from(initialBalance).mul(1000) : 0,
                bntRate: 1,
                baseTokenRate: 2
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
        standardStakingRewards: TestStandardStakingRewards,
        pool: TokenWithAddress,
        rewardsToken: TokenWithAddress,
        totalRewards: BigNumberish,
        startTime: number,
        endTime: number
    ) => {
        const id = await standardStakingRewards.nextProgramId();

        await standardStakingRewards.createProgram(
            pool.address,
            rewardsToken.address,
            totalRewards,
            startTime,
            endTime
        );

        return id;
    };

    const setTime = async (standardStakingRewards: TestStandardStakingRewards, time: number) => {
        await standardStakingRewards.setTime(time);

        now = time;
    };

    const increaseTime = async (standardStakingRewards: TestStandardStakingRewards, duration: number) =>
        setTime(standardStakingRewards, now + duration);

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

        const TOTAL_REWARDS = toWei(1000);

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
                        standardStakingRewards
                            .connect(nonAdmin)
                            .createProgram(pool.address, bnt.address, TOTAL_REWARDS, now, now + duration.days(1))
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should revert when attempting to create a program with for an invalid pool', async () => {
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

                it('should revert when attempting to create a program with an invalid reward token', async () => {
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

                it('should revert when attempting to create a program with an invalid total rewards amount', async () => {
                    await expect(
                        standardStakingRewards.createProgram(pool.address, bnt.address, 0, now, now + duration.days(1))
                    ).to.be.revertedWith('ZeroValue');
                });

                it('should revert when attempting to create a program with an invalid duration', async () => {
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
                            standardStakingRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );
                    });

                    it('should revert', async () => {
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

                    context('when the active program was disabled', () => {
                        beforeEach(async () => {
                            await standardStakingRewards.enableProgram(id, false);
                        });

                        it('should revert', async () => {
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

            it('should revert when a non-admin is attempting to terminate a program', async () => {
                await expect(standardStakingRewards.connect(nonAdmin).terminateProgram(1)).to.be.revertedWith(
                    'AccessDenied'
                );
            });

            it('should revert when attempting to terminate a non-existing program', async () => {
                await expect(standardStakingRewards.terminateProgram(1)).to.be.revertedWith('ProgramDoesNotExist');
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

                    id = await createProgram(
                        standardStakingRewards,
                        pool,
                        rewardsToken,
                        TOTAL_REWARDS,
                        startTime,
                        endTime
                    );
                });

                const testTerminate = async () => {
                    const prevUnclaimedRewards = await standardStakingRewards.unclaimedRewards(rewardsToken.address);

                    const res = await standardStakingRewards.terminateProgram(id);

                    const remainingRewards = now >= endTime ? 0 : rewardRate.mul(endTime - now);
                    await expect(res)
                        .to.emit(standardStakingRewards, 'ProgramTerminated')
                        .withArgs(pool.address, id, endTime, remainingRewards);

                    expect(await standardStakingRewards.isProgramActive(id)).to.be.false;

                    expect(await standardStakingRewards.unclaimedRewards(rewardsToken.address)).to.equal(
                        prevUnclaimedRewards.sub(remainingRewards)
                    );
                };

                it('should allow terminating the program', async () => {
                    await testTerminate();
                });

                context('when the active program was disabled', () => {
                    beforeEach(async () => {
                        await standardStakingRewards.enableProgram(id, false);
                    });

                    it('should allow terminating the program', async () => {
                        await testTerminate();
                    });
                });

                context('after the active program has ended', () => {
                    beforeEach(async () => {
                        await setTime(standardStakingRewards, endTime + 1);
                    });

                    it('should revert', async () => {
                        await expect(standardStakingRewards.terminateProgram(id)).to.be.revertedWith('ProgramInactive');
                    });
                });

                context('when the active program was terminated', () => {
                    beforeEach(async () => {
                        await standardStakingRewards.terminateProgram(id);
                    });

                    it('should revert', async () => {
                        await expect(standardStakingRewards.terminateProgram(id)).to.be.revertedWith('ProgramInactive');
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
                    await expect(standardStakingRewards.connect(nonAdmin).enableProgram(1, status)).to.be.revertedWith(
                        'AccessDenied'
                    );
                }
            });

            it('should revert when attempting to enable/disable a non-existing program', async () => {
                for (const status of [true, false]) {
                    await expect(standardStakingRewards.enableProgram(1, status)).to.be.revertedWith(
                        'ProgramDoesNotExist'
                    );
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

                    id = await createProgram(
                        standardStakingRewards,
                        pool,
                        rewardsToken,
                        TOTAL_REWARDS,
                        startTime,
                        endTime
                    );
                });

                const testDisableEnable = async () => {
                    expect(await standardStakingRewards.isProgramEnabled(id)).to.be.true;

                    const res = await standardStakingRewards.enableProgram(id, false);

                    const remainingRewards = now >= endTime ? 0 : rewardRate.mul(endTime - now);
                    await expect(res)
                        .to.emit(standardStakingRewards, 'ProgramEnabled')
                        .withArgs(pool.address, id, false, remainingRewards);

                    expect(await standardStakingRewards.isProgramEnabled(id)).to.be.false;

                    const res2 = await standardStakingRewards.enableProgram(id, true);

                    await expect(res2)
                        .to.emit(standardStakingRewards, 'ProgramEnabled')
                        .withArgs(pool.address, id, true, remainingRewards);

                    expect(await standardStakingRewards.isProgramEnabled(id)).to.be.true;
                };

                it('should allow enabling/disabling the program', async () => {
                    await testDisableEnable();
                });

                it('should ignore setting to the same status', async () => {
                    const res = await standardStakingRewards.enableProgram(id, true);

                    await expect(res).not.to.emit(standardStakingRewards, 'ProgramEnabled');

                    await standardStakingRewards.enableProgram(id, false);

                    const res2 = await standardStakingRewards.enableProgram(id, false);
                    await expect(res2).not.to.emit(standardStakingRewards, 'ProgramEnabled');
                });

                context('after the active program has ended', () => {
                    beforeEach(async () => {
                        await setTime(standardStakingRewards, endTime + 1);
                    });

                    it('should allow enabling/disabling the program', async () => {
                        await testDisableEnable();
                    });
                });

                context('when the active program was terminated', () => {
                    beforeEach(async () => {
                        await standardStakingRewards.terminateProgram(id);
                    });

                    it('should allow enabling/disabling the program', async () => {
                        await testDisableEnable();
                    });
                });
            });
        });
    });

    describe('joining/leaving', () => {
        let standardStakingRewards: TestStandardStakingRewards;
        let provider: Wallet;

        const DEPOSIT_AMOUNT = toWei(1000);
        const TOTAL_REWARDS = toWei(10_000);

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

            provider = await createWallet();

            standardStakingRewards = await createStandardStakingRewards(
                network,
                networkSettings,
                bntGovernance,
                bntPool,
                externalRewardsVault
            );

            await setTime(standardStakingRewards, now);
        });

        describe('joining', () => {
            describe('basic tests', () => {
                let poolToken: IPoolToken;
                let rewardsToken: TokenWithAddress;

                beforeEach(async () => {
                    rewardsToken = await createTestToken();

                    ({ poolToken } = await prepareSimplePool(
                        new TokenData(TokenSymbol.TKN),
                        new TokenData(TokenSymbol.TKN),
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));
                });

                const testBasicTests = (permitted: boolean) => {
                    const join = async (id: BigNumberish, amount: BigNumberish) => {
                        if (!permitted) {
                            return standardStakingRewards.connect(provider).join(id, amount);
                        }

                        const signature = await permitSignature(
                            provider,
                            poolToken.address,
                            network,
                            bnt,
                            amount,
                            MAX_UINT256
                        );

                        return standardStakingRewards
                            .connect(provider)
                            .joinPermitted(id, amount, MAX_UINT256, signature.v, signature.r, signature.s);
                    };

                    it('should revert when attempting to join a non-existing pool', async () => {
                        await expect(join(0, 1)).to.be.revertedWith('ProgramDoesNotExist');
                    });

                    it('should revert when attempting to join with an invalid amount', async () => {
                        await expect(join(1, 0)).to.be.revertedWith('ZeroValue');
                    });
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
                            standardStakingRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );
                    });

                    context('without approving the pool token', () => {
                        it('should revert', async () => {
                            await expect(
                                standardStakingRewards.connect(provider).join(id, poolTokenAmount)
                            ).to.be.revertedWith(new TokenData(TokenSymbol.bnBNT).errors().exceedsAllowance);
                        });
                    });

                    context('with pool token approval', () => {
                        beforeEach(async () => {
                            await poolToken.connect(provider).approve(standardStakingRewards.address, poolTokenAmount);
                        });

                        const testJoinProgram = async (id: BigNumber, amount: BigNumberish) => {
                            const expectedUpdateTime = now > endTime ? endTime : now;

                            const prevProgramRewards = await standardStakingRewards.programRewards(id);
                            expect(prevProgramRewards.lastUpdateTime).not.to.equal(expectedUpdateTime);

                            const prevProviderRewards = await standardStakingRewards.providerRewards(
                                provider.address,
                                id
                            );
                            const prevProgramStake = await standardStakingRewards.programStake(id);
                            const prevProviderBalance = await poolToken.balanceOf(provider.address);
                            const prevStandardStakingRewardsBalance = await poolToken.balanceOf(
                                standardStakingRewards.address
                            );
                            const prevRewardsTokenBalance = await getBalance(
                                rewardsToken,
                                standardStakingRewards.address
                            );

                            const res = await standardStakingRewards.connect(provider).join(id, amount);

                            await expect(res)
                                .to.emit(standardStakingRewards, 'ProviderJoined')
                                .withArgs(pool.address, id, provider.address, amount, prevProviderRewards.stakedAmount);

                            const programRewards = await standardStakingRewards.programRewards(id);
                            const providerRewards = await standardStakingRewards.providerRewards(provider.address, id);

                            // ensure that the snapshot has been updated
                            expect(programRewards.lastUpdateTime).to.equal(expectedUpdateTime);

                            // ensure that the stake amounts have been updated
                            expect(await standardStakingRewards.programStake(id)).to.equal(
                                prevProgramStake.add(amount)
                            );
                            expect(providerRewards.stakedAmount).to.equal(prevProviderRewards.stakedAmount.add(amount));

                            expect(await poolToken.balanceOf(provider.address)).to.equal(
                                prevProviderBalance.sub(amount)
                            );
                            expect(await poolToken.balanceOf(standardStakingRewards.address)).to.equal(
                                prevStandardStakingRewardsBalance.add(amount)
                            );

                            expect(await getBalance(rewardsToken, standardStakingRewards.address)).to.equal(
                                prevRewardsTokenBalance
                            );
                        };

                        it('should join', async () => {
                            await testJoinProgram(id, poolTokenAmount);
                        });

                        it('should join the same program multiple times', async () => {
                            const count = 3;
                            for (let i = 0; i < count; i++) {
                                await testJoinProgram(id, poolTokenAmount.div(count));

                                await increaseTime(standardStakingRewards, duration.days(1));
                            }
                        });

                        context('when the active program was disabled', () => {
                            beforeEach(async () => {
                                await standardStakingRewards.enableProgram(id, false);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardStakingRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWith('ProgramDisabled');
                            });
                        });

                        context('after the active program has ended', () => {
                            beforeEach(async () => {
                                await setTime(standardStakingRewards, endTime + 1);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardStakingRewards.connect(provider).join(id, poolTokenAmount)
                                ).to.be.revertedWith('ProgramInactive');
                            });
                        });

                        context('when the active program was terminated', () => {
                            beforeEach(async () => {
                                await standardStakingRewards.terminateProgram(id);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardStakingRewards.connect(provider).join(id, poolTokenAmount)
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

                it('should revert when attempting to leave a non-existing pool', async () => {
                    await expect(standardStakingRewards.connect(provider).leave(0, 1)).to.be.revertedWith(
                        'ProgramDoesNotExist'
                    );
                });

                it('should revert when attempting to leave with an invalid amount', async () => {
                    await expect(standardStakingRewards.connect(provider).leave(1, 0)).to.be.revertedWith('ZeroValue');
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

                context('when an active program', () => {
                    let startTime: number;
                    let endTime: number;

                    let id: BigNumber;

                    beforeEach(async () => {
                        startTime = now;
                        endTime = now + duration.weeks(12);

                        id = await createProgram(
                            standardStakingRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );

                        await poolToken.connect(provider).approve(standardStakingRewards.address, poolTokenAmount);
                        await standardStakingRewards.connect(provider).join(id, poolTokenAmount);

                        await increaseTime(standardStakingRewards, duration.seconds(1));
                    });

                    const testLeaveProgram = async (id: BigNumber, amount: BigNumberish) => {
                        const expectedUpdateTime = now > endTime ? endTime : now;

                        const prevProgramRewards = await standardStakingRewards.programRewards(id);
                        expect(prevProgramRewards.lastUpdateTime).not.to.equal(expectedUpdateTime);

                        const prevProgramStake = await standardStakingRewards.programStake(id);
                        const prevProviderRewards = await standardStakingRewards.providerRewards(provider.address, id);
                        const prevProviderBalance = await poolToken.balanceOf(provider.address);
                        const prevStandardStakingRewardsBalance = await poolToken.balanceOf(
                            standardStakingRewards.address
                        );
                        const prevRewardsTokenBalance = await getBalance(rewardsToken, standardStakingRewards.address);

                        const res = await standardStakingRewards.connect(provider).leave(id, amount);

                        await expect(res)
                            .to.emit(standardStakingRewards, 'ProviderLeft')
                            .withArgs(
                                pool.address,
                                id,
                                provider.address,
                                amount,
                                prevProviderRewards.stakedAmount.sub(amount)
                            );

                        const programRewards = await standardStakingRewards.programRewards(id);
                        const providerRewards = await standardStakingRewards.providerRewards(provider.address, id);

                        // ensure that the snapshot has been updated
                        expect(programRewards.lastUpdateTime).to.equal(expectedUpdateTime);

                        // ensure that the stake amounts have been updated
                        expect(await standardStakingRewards.programStake(id)).to.equal(prevProgramStake.sub(amount));
                        expect(providerRewards.stakedAmount).to.equal(prevProviderRewards.stakedAmount.sub(amount));

                        expect(await poolToken.balanceOf(provider.address)).to.equal(prevProviderBalance.add(amount));
                        expect(await poolToken.balanceOf(standardStakingRewards.address)).to.equal(
                            prevStandardStakingRewardsBalance.sub(amount)
                        );

                        expect(await getBalance(rewardsToken, standardStakingRewards.address)).to.equal(
                            prevRewardsTokenBalance
                        );
                    };

                    it('should leave', async () => {
                        await testLeaveProgram(id, poolTokenAmount);
                    });

                    it('should leave the same program multiple times', async () => {
                        const count = 3;
                        for (let i = 0; i < count; i++) {
                            await testLeaveProgram(id, poolTokenAmount.div(count));

                            await increaseTime(standardStakingRewards, duration.days(1));
                        }
                    });

                    context('when the active program was disabled', () => {
                        beforeEach(async () => {
                            await standardStakingRewards.enableProgram(id, false);
                        });

                        it('should leave', async () => {
                            await testLeaveProgram(id, poolTokenAmount);
                        });
                    });

                    context('after the active program has ended', () => {
                        beforeEach(async () => {
                            await setTime(standardStakingRewards, endTime + 1);
                        });

                        it('should leave', async () => {
                            await testLeaveProgram(id, poolTokenAmount);
                        });
                    });

                    context('when the active program was terminated', () => {
                        beforeEach(async () => {
                            await standardStakingRewards.terminateProgram(id);
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

                    id = await createProgram(
                        standardStakingRewards,
                        pool,
                        rewardsToken,
                        TOTAL_REWARDS,
                        startTime,
                        endTime
                    );

                    ({ token: nativePool } = await prepareSimplePool(
                        new TokenData(TokenSymbol.ETH),
                        new TokenData(TokenSymbol.TKN),
                        rewardsToken,
                        INITIAL_BALANCE,
                        TOTAL_REWARDS
                    ));

                    nativeId = await createProgram(
                        standardStakingRewards,
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

                            if (!value) {
                                value = BigNumber.from(0);

                                const programs = await standardStakingRewards.programs([id]);
                                const program = programs[0];

                                if (program.pool === nativePool.address) {
                                    value = BigNumber.from(amount);
                                }
                            }

                            return standardStakingRewards.connect(provider).depositAndJoin(id, amount, { value });
                        }

                        const signature = await permitSignature(
                            provider,
                            pool.address,
                            standardStakingRewards,
                            bnt,
                            amount,
                            MAX_UINT256
                        );

                        return standardStakingRewards
                            .connect(provider)
                            .depositAndJoinPermitted(id, amount, MAX_UINT256, signature.v, signature.r, signature.s);
                    };

                    it('should revert when attempting to deposit and join a non-existing pool', async () => {
                        await expect(depositAndJoin(0, 1)).to.be.revertedWith('ProgramDoesNotExist');
                    });

                    it('should revert when attempting to deposit and join with an invalid amount', async () => {
                        await expect(depositAndJoin(1, 0)).to.be.revertedWith('ZeroValue');
                    });

                    it('should revert when attempting to deposit and join with an invalid amount', async () => {
                        await expect(depositAndJoin(1, 0)).to.be.revertedWith('ZeroValue');
                    });

                    if (!permitted) {
                        context('native pool', () => {
                            it('should revert when attempting to deposit and join with more than what was actually sent', async () => {
                                const amount = toWei(1);
                                const missingAmount = 1;

                                await expect(
                                    depositAndJoin(nativeId, amount, {
                                        value: amount.sub(missingAmount)
                                    })
                                ).to.be.revertedWith('EthAmountMismatch');

                                await expect(
                                    depositAndJoin(nativeId, amount, { value: BigNumber.from(0) })
                                ).to.be.revertedWith('EthAmountMismatch');
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
                            it('should revert when attempting to deposit and join ETH into a non ETH pool', async () => {
                                const amount = toWei(1);

                                await expect(
                                    depositAndJoin(id, amount, { value: BigNumber.from(1) })
                                ).to.be.revertedWith('EthAmountMismatch');
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
                            standardStakingRewards,
                            pool,
                            rewardsToken,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );
                    });

                    context('without approving the token', () => {
                        it('should revert', async () => {
                            await expect(
                                standardStakingRewards.connect(provider).depositAndJoin(id, tokenAmount)
                            ).to.be.revertedWith(poolData.errors().exceedsAllowance);
                        });
                    });

                    context('with token approval', () => {
                        if (!poolData.isNative()) {
                            beforeEach(async () => {
                                const token = await Contracts.TestERC20Token.attach(pool.address);

                                await token.connect(provider).approve(standardStakingRewards.address, tokenAmount);
                            });
                        }

                        const testDepositAndJoinProgram = async (id: BigNumber, amount: BigNumberish) => {
                            const expectedUpdateTime = now > endTime ? endTime : now;

                            const prevProgramRewards = await standardStakingRewards.programRewards(id);
                            expect(prevProgramRewards.lastUpdateTime).not.to.equal(expectedUpdateTime);

                            const prevProviderRewards = await standardStakingRewards.providerRewards(
                                provider.address,
                                id
                            );
                            const prevProgramStake = await standardStakingRewards.programStake(id);

                            const prevProviderTokenBalance = await getBalance(pool, provider.address);
                            const prevStandardStakingRewardsBalance = await poolToken.balanceOf(
                                standardStakingRewards.address
                            );
                            const prevRewardsTokenBalance = await getBalance(
                                rewardsToken,
                                standardStakingRewards.address
                            );

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

                            const res = await standardStakingRewards
                                .connect(provider)
                                .depositAndJoin(id, amount, { value });

                            let transactionCost = BigNumber.from(0);
                            if (poolData.isNative()) {
                                transactionCost = await getTransactionCost(res);
                            }

                            await expect(res)
                                .to.emit(standardStakingRewards, 'ProviderJoined')
                                .withArgs(
                                    pool.address,
                                    id,
                                    provider.address,
                                    expectedPoolTokenAmount,
                                    prevProviderRewards.stakedAmount
                                );

                            const programRewards = await standardStakingRewards.programRewards(id);
                            const providerRewards = await standardStakingRewards.providerRewards(provider.address, id);

                            // ensure that the snapshot has been updated
                            expect(programRewards.lastUpdateTime).to.equal(expectedUpdateTime);

                            // ensure that the stake amounts have been updated
                            expect(await standardStakingRewards.programStake(id)).to.equal(
                                prevProgramStake.add(amount)
                            );
                            expect(providerRewards.stakedAmount).to.equal(prevProviderRewards.stakedAmount.add(amount));

                            expect(await getBalance(pool, provider.address)).to.equal(
                                prevProviderTokenBalance.sub(amount).sub(transactionCost)
                            );
                            expect(await poolToken.balanceOf(standardStakingRewards.address)).to.equal(
                                prevStandardStakingRewardsBalance.add(expectedPoolTokenAmount)
                            );

                            expect(await getBalance(rewardsToken, standardStakingRewards.address)).to.equal(
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

                                await increaseTime(standardStakingRewards, duration.days(1));
                            }
                        });

                        context('when the active program was disabled', () => {
                            beforeEach(async () => {
                                await standardStakingRewards.enableProgram(id, false);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardStakingRewards.connect(provider).depositAndJoin(id, tokenAmount)
                                ).to.be.revertedWith('ProgramDisabled');
                            });
                        });

                        context('after the active program has ended', () => {
                            beforeEach(async () => {
                                await setTime(standardStakingRewards, endTime + 1);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardStakingRewards.connect(provider).depositAndJoin(id, tokenAmount)
                                ).to.be.revertedWith('ProgramInactive');
                            });
                        });

                        context('when the active program was terminated', () => {
                            beforeEach(async () => {
                                await standardStakingRewards.terminateProgram(id);
                            });

                            it('should revert', async () => {
                                await expect(
                                    standardStakingRewards.connect(provider).depositAndJoin(id, tokenAmount)
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
        let standardStakingRewards: TestStandardStakingRewards;

        let provider: SignerWithAddress;
        let provider2: SignerWithAddress;

        before(async () => {
            [, provider, provider2] = await ethers.getSigners();
        });

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
                standardStakingRewards,
                pool,
                rewardsData.rewardsToken,
                rewardsData.totalRewards,
                rewardsData.startTime,
                rewardsData.endTime
            );

            const providerPoolTokenAmounts: Record<string, BigNumber> = {};

            for (const [i, p] of [provider, provider2].entries()) {
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

        describe.only('claiming', () => {
            const testBasicClaiming = async (programSpec: ProgramSpec, rewardsSpec: RewardsSpec) => {
                describe('basic tests', () => {
                    let rewardsData: RewardsData;
                    let programData: ProgramData;

                    beforeEach(async () => {
                        rewardsData = await setupRewardsData(rewardsSpec);
                        programData = await setupProgram(programSpec, rewardsData);
                    });

                    it('should revert when attempting to claim rewards for non-existing programs', async () => {
                        await expect(
                            standardStakingRewards.connect(provider).claimRewards([10000], MAX_UINT256)
                        ).to.be.revertedWith('ProgramDoesNotExist');

                        await expect(
                            standardStakingRewards.connect(provider).claimRewards([programData.id, 10000], MAX_UINT256)
                        ).to.be.revertedWith('ProgramDoesNotExist');
                    });

                    it('should revert when attempting to claim rewards with duplicate ids', async () => {
                        await expect(
                            standardStakingRewards.connect(provider).claimRewards([10000, 10000], MAX_UINT256)
                        ).to.be.revertedWith('ArrayNotUnique');

                        await expect(
                            standardStakingRewards
                                .connect(provider)
                                .claimRewards([programData.id, programData.id], MAX_UINT256)
                        ).to.be.revertedWith('ArrayNotUnique');
                    });

                    it('should revert when attempting to claim rewards from multiple programs with different reward tokens', async () => {
                        const newRewardsToken = await createTestToken();

                        const { token: pool } = await prepareSimplePool(
                            new TokenData(TokenSymbol.TKN2),
                            new TokenData(TokenSymbol.TKN2),
                            newRewardsToken,
                            programSpec.initialBalance,
                            rewardsSpec.totalRewards
                        );
                        const totalRewards = 1;
                        await transfer(deployer, newRewardsToken, externalRewardsVault, totalRewards);

                        const newId = await createProgram(
                            standardStakingRewards,
                            pool,
                            newRewardsToken,
                            totalRewards,
                            now,
                            now + duration.years(1)
                        );

                        await expect(
                            standardStakingRewards.connect(provider).claimRewards([programData.id, newId], MAX_UINT256)
                        ).to.be.revertedWith('RewardsTokenMismatch');
                    });
                });
            };

            const programSpecToString = (programSpec: ProgramSpec) =>
                `(pool=${
                    programSpec.poolSymbol
                }, initialBalance=${programSpec.initialBalance.toString()}, stakes=${programSpec.providerStakes.map(
                    (s) => s.toString()
                )})`;

            const rewardSpecToString = (rewardsSpec: RewardsSpec) => {
                return `(rewards=${
                    rewardsSpec.rewardsSymbol
                }, totalRewards=${rewardsSpec.totalRewards.toString()}, duration=${humanizeDuration(
                    rewardsSpec.duration * 1000,
                    { units: ['d'] }
                )})`;
            };

            const testClaiming = (programSpec: ProgramSpec, programSpec2: ProgramSpec, rewardsSpec: RewardsSpec) => {
                describe(`full tests ${programSpecToString(programSpec)}, ${programSpecToString(
                    programSpec2
                )}, ${rewardSpecToString(rewardsSpec)}`, () => {
                    let programsData: Record<number, ProgramData>;
                    let rewardsData: RewardsData;

                    beforeEach(async () => {
                        programsData = {};

                        rewardsData = await setupRewardsData(rewardsSpec);

                        for (const spec of [programSpec, programSpec2]) {
                            const data = await setupProgram(spec, rewardsData);
                            programsData[data.id] = data;
                        }
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

                            for (const p of [provider, provider2]) {
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
                        if (!rewardsData.programRewardsData[id]) {
                            return BigNumber.from(0);
                        }

                        return rewardsData.programRewardsData[id].pendingRewards[provider.address] || BigNumber.from(0);
                    };

                    const join = async (provider: SignerWithAddress, id: number, amount: BigNumberish) => {
                        snapshotRewards();

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

                        const programData = programsData[id];
                        await programData.poolToken.connect(provider).approve(standardStakingRewards.address, amount);
                        return standardStakingRewards.connect(provider).join(id, amount);
                    };

                    const leave = async (provider: SignerWithAddress, id: number, amount: BigNumberish) => {
                        snapshotRewards();

                        const programRewardsData = rewardsData.programRewardsData[id];

                        expect(programRewardsData.totalStake).to.be.gte(amount);

                        programRewardsData.totalStake = programRewardsData.totalStake.sub(amount);

                        expect(programRewardsData.stakes[provider.address]).to.be.gte(amount);

                        programRewardsData.stakes[provider.address] =
                            programRewardsData.stakes[provider.address].sub(amount);

                        return standardStakingRewards.connect(provider).leave(id, amount);
                    };

                    const joinPortion = async (portions: number[]) => {
                        snapshotRewards();

                        const [id, id2] = Object.keys(programsData).map((k) => Number(k));

                        for (const p of [provider, provider2]) {
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

                        const [id, id2] = Object.keys(programsData).map((k) => Number(k));

                        for (const p of [provider, provider2]) {
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

                    const claim = async (provider: SignerWithAddress, ids: number[], maxAmount: BigNumberish) => {
                        snapshotRewards();

                        const claimed = await standardStakingRewards
                            .connect(provider)
                            .callStatic.claimRewardsWithAmounts(ids, maxAmount);

                        for (const [i, id] of ids.entries()) {
                            const programRewardsData = rewardsData.programRewardsData[id];

                            programRewardsData.claimedRewards[provider.address] = programRewardsData.claimedRewards[
                                provider.address
                            ].sub(claimed[i]);
                        }

                        const totalClaimed = await standardStakingRewards
                            .connect(provider)
                            .callStatic.claimRewards(ids, maxAmount);

                        expect(claimed.reduce((res, c) => res.add(c), BigNumber.from(0))).to.equal(totalClaimed);

                        const res = await standardStakingRewards.connect(provider).claimRewards(ids, maxAmount);

                        return { totalClaimed, claimed, res };
                    };

                    const testProviderPendingRewards = async (provider: SignerWithAddress) => {
                        snapshotRewards();

                        const [id, id2] = Object.keys(programsData).map((k) => Number(k));

                        expect(await standardStakingRewards.pendingRewards(provider.address, [id])).to.be.almostEqual(
                            getExpectedRewards(provider, id),
                            {
                                maxAbsoluteError: new Decimal(1),
                                maxRelativeError: new Decimal('0000000000000000000001'),
                                relation: Relation.LesserOrEqual
                            }
                        );

                        expect(await standardStakingRewards.pendingRewards(provider.address, [id])).to.be.almostEqual(
                            getExpectedRewards(provider, id2),
                            {
                                maxAbsoluteError: new Decimal(1),
                                maxRelativeError: new Decimal('0000000000000000000001'),
                                relation: Relation.LesserOrEqual
                            }
                        );

                        expect(
                            await standardStakingRewards.pendingRewards(provider.address, [id, id2])
                        ).to.be.almostEqual(getExpectedRewards(provider, id).add(getExpectedRewards(provider, id2)), {
                            maxAbsoluteError: new Decimal(0),
                            maxRelativeError: new Decimal('0000000000000000000001'),
                            relation: Relation.LesserOrEqual
                        });
                    };

                    const testPendingRewards = async () => {
                        snapshotRewards();

                        for (const p of [provider, provider2]) {
                            await testProviderPendingRewards(p);
                        }
                    };

                    const testClaimRewards = async (maxAmount: BigNumberish = MAX_UINT256) => {
                        snapshotRewards();

                        const [id, id2] = Object.keys(programsData).map((k) => Number(k));

                        for (const p of [provider, provider2]) {
                            const expectedProgramReward = getExpectedRewards(p, id);
                            const expectedProgramReward2 = getExpectedRewards(p, id2);

                            expect(await standardStakingRewards.pendingRewards(p.address, [id, id2])).to.be.almostEqual(
                                expectedProgramReward.add(expectedProgramReward2),
                                {
                                    maxAbsoluteError: new Decimal(2),
                                    maxRelativeError: new Decimal('0000000000000000000001')
                                }
                            );

                            const expectedProgramClaimedReward = min(expectedProgramReward, maxAmount);
                            const expectedProgramClaimedReward2 = min(expectedProgramReward2, maxAmount);
                            const expectedTotalClaimedReward =
                                expectedProgramClaimedReward.add(expectedProgramClaimedReward2);

                            const programData = programsData[id];
                            const programData2 = programsData[id2];
                            const { rewardsTokenData, rewardsToken } = rewardsData;
                            const prevUnclaimedRewards = await standardStakingRewards.unclaimedRewards(
                                rewardsToken.address
                            );

                            const prevProviderBalance = await getBalance(rewardsToken, p);
                            const prevBntTotalSupply = await bnt.totalSupply();
                            const prevExternalVaultBalance = await getBalance(
                                rewardsToken,
                                externalRewardsVault.address
                            );

                            const { totalClaimed, claimed, res } = await claim(p, [id, id2], maxAmount);

                            let transactionCost = BigNumber.from(0);
                            if (rewardsTokenData.isNative()) {
                                transactionCost = await getTransactionCost(res);
                            }

                            expect(totalClaimed).to.be.almostEqual(expectedTotalClaimedReward, {
                                maxAbsoluteError: new Decimal(0),
                                maxRelativeError: new Decimal('0000000000000000000001')
                            });

                            await expect(res)
                                .to.emit(standardStakingRewards, 'RewardsClaimed')
                                .withArgs(programData.pool.address, programData.id, p.address, claimed[0]);

                            await expect(res)
                                .to.emit(standardStakingRewards, 'RewardsClaimed')
                                .withArgs(programData2.pool.address, programData2.id, p.address, claimed[1]);

                            expect(await standardStakingRewards.unclaimedRewards(rewardsToken.address)).to.equal(
                                prevUnclaimedRewards.sub(totalClaimed)
                            );

                            expect(await getBalance(rewardsToken, p)).to.equal(
                                prevProviderBalance.add(totalClaimed).sub(transactionCost)
                            );

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
                    };

                    it('should properly calculate and claim rewards', async () => {
                        // pending rewards should be 0 prior to joining
                        await testPendingRewards();

                        // join with [30%, 50%] of the initial pool token amount
                        await joinPortion([toPPM(30), toPPM(50)]);

                        // pending rewards should be 0 immediately after joining
                        await testPendingRewards();

                        // increase the staking duration
                        await increaseTime(standardStakingRewards, duration.days(1));

                        // ensure that pending rewards are correct
                        await testPendingRewards();

                        // join with additional 20% of the initial pool token amount
                        await joinPortion([toPPM(20), toPPM(20)]);

                        // increase the staking duration
                        await increaseTime(standardStakingRewards, duration.weeks(1));

                        // ensure that claiming rewards works properly
                        await testClaimRewards();

                        // leave additional [20%, 10%] of the initial pool token amount
                        await leavePortion([toPPM(20), toPPM(10)]);

                        // increase the staking duration
                        await increaseTime(standardStakingRewards, duration.days(3));

                        // ensure that claiming rewards works properly
                        await testClaimRewards();

                        // increase the staking duration
                        await increaseTime(standardStakingRewards, duration.weeks(1));

                        // join with additional 5% of the initial pool token amount
                        await joinPortion([toPPM(5), toPPM(5)]);

                        // increase the staking duration
                        await increaseTime(standardStakingRewards, duration.minutes(60));

                        // ensure that claiming rewards works properly
                        await testClaimRewards();

                        // ensure that the program has finished
                        await setTime(standardStakingRewards, rewardsData.endTime + duration.weeks(2));

                        // ensure that claiming rewards works properly
                        await testClaimRewards();
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
                                    for (const providerStake of [1000, toWei(100_000)]) {
                                        for (const providerStake2 of [2000, toWei(200_000)]) {
                                            for (const totalRewards of [toWei(10_000), toWei(1_000_000)]) {
                                                for (const programDuration of [duration.weeks(12), duration.years(1)]) {
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
