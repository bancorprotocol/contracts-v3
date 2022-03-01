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
import { MAX_UINT256, ZERO_ADDRESS } from '../../utils/Constants';
import { permitSignature } from '../../utils/Permit';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei } from '../../utils/Types';
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
import { createWallet, getBalance, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish, Wallet } from 'ethers';
import { ethers } from 'hardhat';

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
                        id = await standardStakingRewards.nextProgramId();

                        await standardStakingRewards.createProgram(
                            pool.address,
                            rewardsToken.address,
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

                    id = await standardStakingRewards.nextProgramId();

                    await standardStakingRewards.createProgram(
                        pool.address,
                        rewardsToken.address,
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

                    id = await standardStakingRewards.nextProgramId();

                    await standardStakingRewards.createProgram(
                        pool.address,
                        rewardsToken.address,
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

                        id = await standardStakingRewards.nextProgramId();

                        await standardStakingRewards.createProgram(
                            pool.address,
                            rewardsToken.address,
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

                                await setTime(standardStakingRewards, now + duration.days(1));
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

                        id = await standardStakingRewards.nextProgramId();

                        await standardStakingRewards.createProgram(
                            pool.address,
                            rewardsToken.address,
                            TOTAL_REWARDS,
                            startTime,
                            endTime
                        );

                        await poolToken.connect(provider).approve(standardStakingRewards.address, poolTokenAmount);
                        await standardStakingRewards.connect(provider).join(id, poolTokenAmount);

                        await setTime(standardStakingRewards, now + duration.seconds(1));
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

                            await setTime(standardStakingRewards, now + duration.days(1));
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
    });
});
