import { BancorNetwork } from '../../../v2/typechain';
import Contracts from '../../components/Contracts';
import {
    IERC20,
    BancorVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestFlashLoanRecipient,
    TestMasterPool,
    TestPendingWithdrawals,
    TestPoolCollection,
    TestPoolCollectionUpgrader,
    ExternalProtectionVault,
    TestAutoCompoundingStakingRewards,
    ExternalRewardsVault
} from '../../typechain-types';
import { expectRole, roles } from '../helpers/AccessControl';
import { MAX_UINT256, NATIVE_TOKEN_ADDRESS, ZERO_ADDRESS } from '../helpers/Constants';
import { createPool, createProxy, createSystem, depositToPool, setupSimplePool } from '../helpers/Factory';
import { mulDivF } from '../helpers/MathUtils';
import { latest } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { TokenWithAddress, createTokenBySymbol, transfer } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles } = roles;

const ONE = new Decimal(1);

const EXP_VAL_TOO_HIGH = 16;

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

describe('AutoCompoundingStakingRewards', () => {
    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    let stakingRewardsProvider: SignerWithAddress;

    let network: TestBancorNetwork;
    let networkSettings: NetworkSettings;
    let masterPool: TestMasterPool;
    let poolCollection: TestPoolCollection;
    let externalRewardsVault: ExternalRewardsVault;

    let autoCompoundingStakingRewards: TestAutoCompoundingStakingRewards;

    before(async () => {
        [deployer, user1, stakingRewardsProvider] = await ethers.getSigners();
    });

    describe('construction', () => {
        beforeEach(async () => {
            ({ network, networkSettings, masterPool, poolCollection, externalRewardsVault } = await createSystem());

            autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
                ctorArgs: [network.address, masterPool.address]
            });
        });

        it('should revert when attempting to reinitialize', async () => {
            await expect(autoCompoundingStakingRewards.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should revert when initialized with an invalid bancor network contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(ZERO_ADDRESS, masterPool.address)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when initialized with an invalid master pool contract', async () => {
            await expect(
                Contracts.AutoCompoundingStakingRewards.deploy(network.address, ZERO_ADDRESS)
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            expect(await autoCompoundingStakingRewards.version()).to.equal(1);

            await expectRole(autoCompoundingStakingRewards, UpgradeableRoles.ROLE_ADMIN, UpgradeableRoles.ROLE_ADMIN, [
                deployer.address
            ]);
        });
    });

    describe('program creation', () => {
        let currentTime: BigNumber;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));
        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
        const TOTAL_DURATION = 10 * MONTH;

        let token: TokenWithAddress;

        beforeEach(async () => {
            ({ network, networkSettings, masterPool, poolCollection, externalRewardsVault } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            currentTime = BigNumber.from(0);

            autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
                ctorArgs: [network.address, masterPool.address]
            });

            ({ token } = await setupSimplePool(
                {
                    symbol: 'TKN',
                    balance: BigNumber.from(10_000),
                    initialRate: INITIAL_RATE
                },
                deployer,
                network,
                networkSettings,
                poolCollection
            ));
        });

        it('should revert when reserve token is not valid', async () => {
            await expect(
                autoCompoundingStakingRewards.createProgram(
                    ZERO_ADDRESS,
                    externalRewardsVault.address,
                    10,
                    0,
                    currentTime,
                    currentTime.add(TOTAL_DURATION)
                )
            ).to.revertedWith('InvalidAddress');
        });

        it('should revert when rewards vault contract is not valid', async () => {
            await expect(
                autoCompoundingStakingRewards.createProgram(
                    token.address,
                    ZERO_ADDRESS,
                    10,
                    0,
                    currentTime,
                    currentTime.add(TOTAL_DURATION)
                )
            ).to.revertedWith('InvalidAddress');
        });

        it('should revert when there is a program already running', async () => {
            await autoCompoundingStakingRewards.createProgram(
                token.address,
                externalRewardsVault.address,
                10,
                0,
                currentTime,
                currentTime.add(TOTAL_DURATION)
            );

            await expect(
                autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    10,
                    0,
                    currentTime,
                    currentTime.add(TOTAL_DURATION)
                )
            ).to.revertedWith('ProgramActive');
        });

        it('should revert when total rewards is lower or equal to 0', async () => {
            await expect(
                autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    -1,
                    0,
                    currentTime,
                    currentTime.add(TOTAL_DURATION)
                )
            ).to.reverted;

            await expect(
                autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    0,
                    0,
                    currentTime,
                    currentTime.add(TOTAL_DURATION)
                )
            ).to.revertedWith('InvalidParam');
        });

        it('should revert when start time is higher than end time', async () => {
            await expect(
                autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    10,
                    0,
                    currentTime.add(TOTAL_DURATION),
                    currentTime
                )
            ).to.be.revertedWith('InvalidParam');
        });

        it('should revert when start time is lower than current time', async () => {
            await autoCompoundingStakingRewards.setTime(1);

            await expect(
                autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    0,
                    0,
                    0,
                    currentTime.add(TOTAL_DURATION)
                )
            ).to.revertedWith('InvalidParam');
        });

        it('should create the program', async () => {
            const startTime = currentTime;
            const endTime = currentTime.add(TOTAL_DURATION);

            const res = await autoCompoundingStakingRewards.createProgram(
                token.address,
                externalRewardsVault.address,
                10,
                0,
                startTime,
                endTime
            );

            await expect(res)
                .to.emit(autoCompoundingStakingRewards, 'ProgramCreated')
                .withArgs(token.address, externalRewardsVault.address, 10, 0, startTime, endTime);

            const program = await autoCompoundingStakingRewards.program(token.address);

            expect(program.pool).to.equal(token.address);
            expect(program.rewardsVault).to.equal(externalRewardsVault.address);
            expect(program.totalRewards).to.equal(10);
            expect(program.availableRewards).to.equal(10);
            expect(program.distributionType).to.equal(0);
            expect(program.startTime).to.equal(startTime);
            expect(program.endTime).to.equal(endTime);
            expect(program.prevDistributionTimestamp).to.equal(0);
            expect(program.isEnabled).to.equal(true);
        });
    });

    describe('program termination', () => {
        let currentTime: BigNumber;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));
        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
        const TOTAL_DURATION = 10 * MONTH;

        let token: TokenWithAddress;

        beforeEach(async () => {
            ({ network, networkSettings, masterPool, poolCollection, externalRewardsVault } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            currentTime = BigNumber.from(0);

            autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
                ctorArgs: [network.address, masterPool.address]
            });

            ({ token } = await setupSimplePool(
                {
                    symbol: 'TKN',
                    balance: BigNumber.from(10_000),
                    initialRate: INITIAL_RATE
                },
                deployer,
                network,
                networkSettings,
                poolCollection
            ));
        });

        context('when no program is running', () => {
            it('should revert when no program is running', async () => {
                await expect(autoCompoundingStakingRewards.terminateProgram(token.address)).to.revertedWith(
                    'ProgramNotActive'
                );
            });
        });

        context('when program is running', () => {
            beforeEach(async () => {
                await autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    10,
                    0,
                    currentTime,
                    currentTime.add(TOTAL_DURATION)
                );
            });

            it('should terminate the program', async () => {
                const newEndTime = 10;

                await autoCompoundingStakingRewards.setTime(newEndTime);

                const res = autoCompoundingStakingRewards.terminateProgram(token.address);

                await expect(res)
                    .to.emit(autoCompoundingStakingRewards, 'ProgramTerminated')
                    .withArgs(token.address, newEndTime, 10);

                const program = await autoCompoundingStakingRewards.program(token.address);

                expect(program.pool).to.equal(token.address);
                expect(program.rewardsVault).to.equal(externalRewardsVault.address);
                expect(program.totalRewards).to.equal(10);
                expect(program.availableRewards).to.equal(0);
                expect(program.distributionType).to.equal(0);
                expect(program.startTime).to.equal(currentTime);
                expect(program.endTime).to.equal(newEndTime);
                expect(program.prevDistributionTimestamp).to.equal(0);
                expect(program.isEnabled).to.equal(true);
            });
        });
    });

    describe('program status', () => {
        let currentTime: BigNumber;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));
        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
        const TOTAL_DURATION = 10 * MONTH;

        let token: TokenWithAddress;

        beforeEach(async () => {
            ({ network, networkSettings, masterPool, poolCollection, externalRewardsVault } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            currentTime = BigNumber.from(0);

            autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
                ctorArgs: [network.address, masterPool.address]
            });

            ({ token } = await setupSimplePool(
                {
                    symbol: 'TKN',
                    balance: BigNumber.from(10_000),
                    initialRate: INITIAL_RATE
                },
                deployer,
                network,
                networkSettings,
                poolCollection
            ));
        });

        context('when program is not active', () => {
            it('should return false when program is not active', async () => {
                expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.false;
            });
        });

        context('when program is active', () => {
            beforeEach(async () => {
                await autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    10,
                    0,
                    currentTime,
                    currentTime.add(TOTAL_DURATION)
                );
            });

            it('should return true when program is active', async () => {
                expect(await autoCompoundingStakingRewards.isProgramActive(token.address)).to.be.true;
            });
        });
    });

    describe('process rewards', () => {
        let currentTime: BigNumber;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));
        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

        let token: TokenWithAddress;
        let poolToken: PoolToken;

        beforeEach(async () => {
            ({ network, networkSettings, masterPool, poolCollection, externalRewardsVault } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            currentTime = BigNumber.from(0);

            autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
                ctorArgs: [network.address, masterPool.address]
            });

            await externalRewardsVault.grantRole(
                roles.ExternalRewardsVault.ROLE_ASSET_MANAGER,
                autoCompoundingStakingRewards.address
            );
        });

        const depositAndTransferToSR = async (
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

        const ownableToken = async (
            user: { address: string },
            poolCollection: TestPoolCollection,
            token: TokenWithAddress,
            poolToken: PoolToken
        ) => {
            const tokenStakedBalance = (await poolCollection.poolLiquidity(token.address)).stakedBalance;
            return Number(
                mulDivF(
                    await poolToken.balanceOf(user.address),
                    tokenStakedBalance,
                    await poolToken.totalSupply()
                ).toString()
            );
        };

        const TOTAL_DURATION = 10 * DAY;
        const TOTAL_REWARDS = 90_000;
        const INITIAL_STAKE = 10_000;

        for (const distributionType of [0]) {
            const distributionTypeName = distributionType === 0 ? 'FLAT' : 'EXPONENTIAL_DECAY';

            context(distributionTypeName, () => {
                beforeEach(async () => {
                    ({ token, poolToken } = await setupSimplePool(
                        {
                            symbol: 'TKN',
                            balance: INITIAL_STAKE,
                            initialRate: INITIAL_RATE
                        },
                        user1,
                        network,
                        networkSettings,
                        poolCollection
                    ));

                    await depositAndTransferToSR(
                        stakingRewardsProvider,
                        token,
                        poolToken,
                        TOTAL_REWARDS,
                        network,
                        externalRewardsVault
                    );

                    await autoCompoundingStakingRewards.createProgram(
                        token.address,
                        externalRewardsVault.address,
                        TOTAL_REWARDS,
                        distributionType,
                        currentTime,
                        currentTime.add(TOTAL_DURATION)
                    );
                });

                it.only('', async () => {
                    for (let i = 1; i <= 10; i++) {
                        await autoCompoundingStakingRewards.setTime(currentTime.add(i * DAY));
                        await autoCompoundingStakingRewards.processRewards(token.address);

                        const user1OwnableTokens = await ownableToken(user1, poolCollection, token, poolToken);
                        const externalRewardsVaultOwnableTokens = await ownableToken(
                            externalRewardsVault,
                            poolCollection,
                            token,
                            poolToken
                        );

                        console.log(user1OwnableTokens);
                        console.log(externalRewardsVaultOwnableTokens);
                    }
                });
            });
        }
    });
});
