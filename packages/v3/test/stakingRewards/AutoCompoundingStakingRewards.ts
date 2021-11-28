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
import { BigNumber } from 'ethers';
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
    const TOTAL_REWARDS = 90_000;

    let deployer: SignerWithAddress;
    let user1: SignerWithAddress;
    let stakingRewardsProvider: SignerWithAddress;

    let network: TestBancorNetwork;
    let networkSettings: NetworkSettings;
    let masterPool: TestMasterPool;
    let poolCollection: TestPoolCollection;
    let externalRewardsVault: ExternalRewardsVault;

    let token: TokenWithAddress;
    let poolToken: PoolToken;

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
        let poolToken: PoolToken;

        beforeEach(async () => {
            ({ network, networkSettings, masterPool, poolCollection, externalRewardsVault } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            currentTime = BigNumber.from(0);

            autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
                ctorArgs: [network.address, masterPool.address]
            });

            ({ token, poolToken } = await setupSimplePool(
                {
                    symbol: 'TKN',
                    balance: BigNumber.from(10_000),
                    initialRate: INITIAL_RATE
                },
                user1,
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
                    TOTAL_REWARDS,
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
                    TOTAL_REWARDS,
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
                TOTAL_REWARDS,
                0,
                currentTime,
                currentTime.add(TOTAL_DURATION)
            );

            await expect(
                autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    TOTAL_REWARDS,
                    0,
                    currentTime,
                    currentTime.add(TOTAL_DURATION)
                )
            ).to.revertedWith('ProgramAlreadyRunning');
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
                    TOTAL_REWARDS,
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
                TOTAL_REWARDS,
                0,
                startTime,
                endTime
            );

            await expect(res)
                .to.emit(autoCompoundingStakingRewards, 'ProgramCreated')
                .withArgs(token.address, externalRewardsVault.address, TOTAL_REWARDS, 0, startTime, endTime);
        });
    });

    describe('program termination', () => {
        let currentTime: BigNumber;

        const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));
        const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };
        const TOTAL_DURATION = 10 * MONTH;

        let token: TokenWithAddress;
        let poolToken: PoolToken;

        beforeEach(async () => {
            ({ network, networkSettings, masterPool, poolCollection, externalRewardsVault } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            currentTime = BigNumber.from(0);

            autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
                ctorArgs: [network.address, masterPool.address]
            });

            ({ token, poolToken } = await setupSimplePool(
                {
                    symbol: 'TKN',
                    balance: BigNumber.from(10_000),
                    initialRate: INITIAL_RATE
                },
                user1,
                network,
                networkSettings,
                poolCollection
            ));
        });

        context('when no program is running', () => {
            it('should revert when no program is running', async () => {
                await expect(autoCompoundingStakingRewards.terminateProgram(token.address)).to.revertedWith(
                    'ProgramNotRunning'
                );
            });
        });

        context('when program is running', () => {
            beforeEach(async () => {
                await autoCompoundingStakingRewards.createProgram(
                    token.address,
                    externalRewardsVault.address,
                    TOTAL_REWARDS,
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
                    .withArgs(token.address, newEndTime, TOTAL_REWARDS);
            });
        });
    });
});

//  //
//  beforeEach(async () => {
//     ({ network, networkSettings, masterPool, poolCollection, externalRewardsVault } = await createSystem());
//     const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1_000));

//     await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

//     autoCompoundingStakingRewards = await createProxy(Contracts.TestAutoCompoundingStakingRewards, {
//         ctorArgs: [network.address, masterPool.address]
//     });

//     const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

//     ({ token, poolToken } = await setupSimplePool(
//         {
//             symbol: 'TKN',
//             balance: BigNumber.from(10_000),
//             initialRate: INITIAL_RATE
//         },
//         user1,
//         network,
//         networkSettings,
//         poolCollection
//     ));

//     // lambda user deposit funds to pool
//     await depositToPool(user2, token, BigNumber.from(10_000), network);

//     // // lambda user deposit funds to pool
//     await depositToPool(user3, token, BigNumber.from(10_000), network);

//     await externalRewardsVault.grantRole(
//         roles.ExternalRewardsVault.ROLE_ASSET_MANAGER,
//         autoCompoundingStakingRewards.address
//     );

//     // sr provider deposit funds to pool
//     await depositToPool(stakingRewardsProvider, token, BigNumber.from(TOTAL_REWARDS), network);

//     // sr provider transfer pool token to external reward vault
//     const tx = await transfer(
//         stakingRewardsProvider,
//         poolToken,
//         externalRewardsVault,
//         BigNumber.from(TOTAL_REWARDS)
//     );
// });

// it('', async () => {
//     const TOTAL_DURATION = 10 * MONTH;

//     const currentTime = await latest();

//     await autoCompoundingStakingRewards.createProgram(
//         token.address,
//         externalRewardsVault.address,
//         TOTAL_REWARDS,
//         0, // flat
//         currentTime,
//         currentTime.add(TOTAL_DURATION)
//     );

//     let program = await autoCompoundingStakingRewards.program(token.address);
//     let poolTokenTotalSupply = await poolToken.totalSupply();
//     let tokenStakedBalance = (await poolCollection.poolLiquidity(token.address)).stakedBalance;
//     let poolTokenUserBalance = await poolToken.balanceOf(user2.address);

//     console.log(
//         'current pool token protec vault balance: ',
//         (await poolToken.balanceOf(externalRewardsVault.address)).toString()
//     );
//     console.log('start program available rewards: ', program.availableRewards.toString());
//     console.log(
//         'token ownable: ',
//         mulDivF(poolTokenUserBalance, tokenStakedBalance, poolTokenTotalSupply).toString()
//     );
//     console.log('');

//     for (let i = 1; i <= 10; i++) {
//         await autoCompoundingStakingRewards.setTime(currentTime.add(i * MONTH));

//         await autoCompoundingStakingRewards.processRewards(token.address);

//         poolTokenTotalSupply = await poolToken.totalSupply();
//         tokenStakedBalance = (await poolCollection.poolLiquidity(token.address)).stakedBalance;

//         program = await autoCompoundingStakingRewards.program(token.address);

//         const currentAvailableRewards = program.availableRewards.toString();
//         console.log('current available rewards: ', currentAvailableRewards);

//         const currentPoolTokenProtecVaultBalance = await poolToken.balanceOf(externalRewardsVault.address);
//         console.log('current pool token protec vault balance: ', currentPoolTokenProtecVaultBalance.toString());

//         console.log(
//             'token ownable user1: ',
//             mulDivF(
//                 await poolToken.balanceOf(user1.address),
//                 tokenStakedBalance,
//                 poolTokenTotalSupply
//             ).toString()
//         );
//         console.log(
//             'token ownable user2: ',
//             mulDivF(
//                 await poolToken.balanceOf(user2.address),
//                 tokenStakedBalance,
//                 poolTokenTotalSupply
//             ).toString()
//         );
//         console.log(
//             'token ownable user3: ',
//             mulDivF(
//                 await poolToken.balanceOf(user3.address),
//                 tokenStakedBalance,
//                 poolTokenTotalSupply
//             ).toString()
//         );
//         console.log(
//             'token ownable user4: ',
//             mulDivF(
//                 await poolToken.balanceOf(user4.address),
//                 tokenStakedBalance,
//                 poolTokenTotalSupply
//             ).toString()
//         );
//         console.log(
//             'token ownable externalRewardsVault: ',
//             mulDivF(
//                 await poolToken.balanceOf(externalRewardsVault.address),
//                 tokenStakedBalance,
//                 poolTokenTotalSupply
//             ).toString()
//         );

//         console.log('');
//     }
// });
// });
