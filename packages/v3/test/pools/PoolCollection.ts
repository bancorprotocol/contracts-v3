import { AsyncReturnType } from '../../components/ContractBuilder';
import Contracts from '../../components/Contracts';
import {
    IERC20,
    ExternalProtectionVault,
    ExternalRewardsVault,
    MasterVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestERC20Token,
    TestMasterPool,
    TestPoolAverageRate,
    TestPoolCollection,
    TestPoolCollectionUpgrader,
    MasterPool
} from '../../typechain-types';
import { PoolLiquidityStructOutput } from '../../typechain-types/TestPoolCollection';
import {
    MAX_UINT256,
    PPM_RESOLUTION,
    ZERO_ADDRESS,
    ZERO_FRACTION,
    ZERO_BYTES32,
    TradingStatusUpdateReason,
    AVERAGE_RATE_PERIOD,
    LIQUIDITY_GROWTH_FACTOR,
    BOOTSTRAPPING_LIQUIDITY_BUFFER_FACTOR
} from '../../utils/Constants';
import { Roles } from '../../utils/Roles';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { toWei, toPPM } from '../../utils/Types';
import { duration, latest } from '..//helpers/Time';
import { transfer, getBalance } from '..//helpers/Utils';
import {
    createPool,
    createPoolCollection,
    createSystem,
    createToken,
    createTestToken,
    depositToPool,
    TokenWithAddress
} from '../helpers/Factory';
import { Relation } from '../matchers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish, ContractTransaction, utils } from 'ethers';
import { ethers } from 'hardhat';

const { formatBytes32String } = utils;

describe('PoolCollection', () => {
    const DEFAULT_TRADING_FEE_PPM = toPPM(0.2);
    const POOL_TYPE = 1;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(500);
    const FUNDING_RATE = { n: 1, d: 2 };
    const MAX_DEVIATION = toPPM(1);
    const CONTEXT_ID = formatBytes32String('CTX');

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    const testLiquidityReset = async (
        token: TokenWithAddress,
        poolCollection: TestPoolCollection,
        masterPool: MasterPool,
        prevTradingEnabled: boolean,
        res: ContractTransaction,
        expectedStakedBalance: BigNumberish,
        expectedFunding: BigNumberish,
        expectedReason: TradingStatusUpdateReason
    ) => {
        if (prevTradingEnabled) {
            await expect(res).to.emit(poolCollection, 'TradingEnabled').withArgs(token.address, false, expectedReason);
        }

        const data = await poolCollection.poolData(token.address);
        const { liquidity } = data;

        expect(data.tradingEnabled).to.be.false;
        expect(data.averageRate.time).to.equal(0);
        expect(data.averageRate.rate).to.equal(ZERO_FRACTION);

        expect(liquidity.networkTokenTradingLiquidity).to.equal(0);
        expect(liquidity.baseTokenTradingLiquidity).to.equal(0);
        expect(liquidity.stakedBalance).to.equal(expectedStakedBalance);

        // ensure that the previous network token liquidity was renounced
        expect(await masterPool.currentPoolFunding(token.address)).to.equal(expectedFunding);
    };

    const testTradingLiquidityEvents = async (
        token: TokenWithAddress,
        poolCollection: TestPoolCollection,
        masterVault: MasterVault,
        networkToken: IERC20,
        prevLiquidity: PoolLiquidityStructOutput,
        newLiquidity: PoolLiquidityStructOutput,
        contextId: string,
        res: ContractTransaction
    ) => {
        let args = [contextId, token.address, networkToken.address, newLiquidity.networkTokenTradingLiquidity];
        if (!prevLiquidity.networkTokenTradingLiquidity.eq(newLiquidity.networkTokenTradingLiquidity)) {
            await expect(res)
                .to.emit(poolCollection, 'TradingLiquidityUpdated')
                .withArgs(...args);
        } else {
            await expect(res)
                .not.to.emit(poolCollection, 'TradingLiquidityUpdated')
                .withArgs(...args);
        }

        args = [contextId, token.address, token.address, newLiquidity.baseTokenTradingLiquidity];
        if (!prevLiquidity.baseTokenTradingLiquidity.eq(newLiquidity.baseTokenTradingLiquidity)) {
            await expect(res)
                .to.emit(poolCollection, 'TradingLiquidityUpdated')
                .withArgs(...args);
        } else {
            await expect(res)
                .not.to.emit(poolCollection, 'TradingLiquidityUpdated')
                .withArgs(...args);
        }

        const poolToken = await Contracts.PoolToken.attach(await poolCollection.poolToken(token.address));
        args = [
            contextId,
            token.address,
            await poolToken.totalSupply(),
            newLiquidity.stakedBalance,
            await getBalance(token, masterVault.address)
        ];

        if (!prevLiquidity.stakedBalance.eq(newLiquidity.stakedBalance)) {
            await expect(res)
                .to.emit(poolCollection, 'TotalLiquidityUpdated')
                .withArgs(...args);
        } else {
            await expect(res)
                .not.to.emit(poolCollection, 'TotalLiquidityUpdated')
                .withArgs(...args);
        }
    };

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let networkSettings: NetworkSettings;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let masterPool: TestMasterPool;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;

        beforeEach(async () => {
            ({
                network,
                networkToken,
                networkSettings,
                masterVault,
                externalProtectionVault,
                masterPool,
                poolTokenFactory,
                poolCollection,
                poolCollectionUpgrader
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    ZERO_ADDRESS,
                    networkToken.address,
                    networkSettings.address,
                    masterVault.address,
                    masterPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network token contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    masterVault.address,
                    masterPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    networkToken.address,
                    ZERO_ADDRESS,
                    masterVault.address,
                    masterPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master vault contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    networkToken.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    masterPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master pool contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    networkToken.address,
                    networkSettings.address,
                    masterVault.address,
                    ZERO_ADDRESS,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external protection vault contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    networkToken.address,
                    networkSettings.address,
                    masterVault.address,
                    masterPool.address,
                    ZERO_ADDRESS,
                    poolTokenFactory.address,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pool token factory contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    networkToken.address,
                    networkSettings.address,
                    masterVault.address,
                    masterPool.address,
                    externalProtectionVault.address,
                    ZERO_ADDRESS,
                    poolCollectionUpgrader.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pool collection upgrader contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    networkToken.address,
                    networkSettings.address,
                    masterVault.address,
                    masterPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            expect(await poolCollection.version()).to.equal(1);

            expect(await poolCollection.poolType()).to.equal(POOL_TYPE);
            expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });

        it('should emit events on initialization', async () => {
            await expect(poolCollection.deployTransaction)
                .to.emit(poolCollection, 'DefaultTradingFeePPMUpdated')
                .withArgs(0, DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('default trading fee', () => {
        const newDefaultTradingFree = 100_000;

        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, poolCollection } = await createSystem());

            expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

            reserveToken = await createTestToken();
        });

        it('should revert when a non-owner attempts to set the default trading fee', async () => {
            await expect(
                poolCollection.connect(nonOwner).setDefaultTradingFeePPM(newDefaultTradingFree)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when setting the default trading fee to an invalid value', async () => {
            await expect(poolCollection.setDefaultTradingFeePPM(PPM_RESOLUTION + 1)).to.be.revertedWith('InvalidFee');
        });

        it('should ignore updating to the same default trading fee', async () => {
            await poolCollection.setDefaultTradingFeePPM(newDefaultTradingFree);

            const res = await poolCollection.setDefaultTradingFeePPM(newDefaultTradingFree);
            await expect(res).not.to.emit(poolCollection, 'DefaultTradingFeePPMUpdated');
        });

        it('should be able to set and update the default trading fee', async () => {
            const res = await poolCollection.setDefaultTradingFeePPM(newDefaultTradingFree);
            await expect(res)
                .to.emit(poolCollection, 'DefaultTradingFeePPMUpdated')
                .withArgs(DEFAULT_TRADING_FEE_PPM, newDefaultTradingFree);

            expect(await poolCollection.defaultTradingFeePPM()).to.equal(newDefaultTradingFree);

            // ensure that the new default trading fee is used during the creation of newer pools
            await createPool(reserveToken, network, networkSettings, poolCollection);

            const pool = await poolCollection.poolData(reserveToken.address);
            expect(pool.tradingFeePPM).to.equal(newDefaultTradingFree);
        });
    });

    describe('create pool', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let poolCollection: TestPoolCollection;
        let reserveToken: TokenWithAddress;

        const testCreatePool = (tokenData: TokenData) => {
            beforeEach(async () => {
                ({ network, networkSettings, poolCollection } = await createSystem());

                reserveToken = await createToken(tokenData);
            });

            it('should revert when attempting to create a pool from a non-network', async () => {
                const nonNetwork = deployer;

                await expect(poolCollection.connect(nonNetwork).createPool(reserveToken.address)).to.be.revertedWith(
                    'AccessDenied'
                );
            });

            it('should revert when attempting to create a pool for a non-whitelisted token', async () => {
                await expect(network.createPoolT(poolCollection.address, reserveToken.address)).to.be.revertedWith(
                    'NotWhitelisted'
                );
            });

            context('with a whitelisted token', () => {
                beforeEach(async () => {
                    await networkSettings.addTokenToWhitelist(reserveToken.address);
                });

                it('should not allow to create the same pool twice', async () => {
                    await network.createPoolT(poolCollection.address, reserveToken.address);

                    await expect(network.createPoolT(poolCollection.address, reserveToken.address)).to.be.revertedWith(
                        'AlreadyExists'
                    );
                });

                it('should create a pool', async () => {
                    const prevPoolCount = await poolCollection.poolCount();

                    expect(await poolCollection.isPoolValid(reserveToken.address)).to.be.false;
                    expect(await poolCollection.pools()).not.to.include(reserveToken.address);

                    const res = await network.createPoolT(poolCollection.address, reserveToken.address);
                    const pool = await poolCollection.poolData(reserveToken.address);

                    await expect(res)
                        .to.emit(poolCollection, 'PoolCreated')
                        .withArgs(pool.poolToken, reserveToken.address);
                    await expect(res)
                        .to.emit(poolCollection, 'TradingFeePPMUpdated')
                        .withArgs(reserveToken.address, 0, pool.tradingFeePPM);
                    await expect(res)
                        .to.emit(poolCollection, 'TradingEnabled')
                        .withArgs(reserveToken.address, false, TradingStatusUpdateReason.Default);
                    await expect(res)
                        .to.emit(poolCollection, 'DepositingEnabled')
                        .withArgs(reserveToken.address, pool.depositingEnabled);
                    await expect(res)
                        .to.emit(poolCollection, 'DepositLimitUpdated')
                        .withArgs(reserveToken.address, 0, pool.depositLimit);

                    expect(await poolCollection.isPoolValid(reserveToken.address)).to.be.true;
                    expect(await poolCollection.pools()).to.include(reserveToken.address);
                    expect(await poolCollection.poolCount()).to.equal(prevPoolCount.add(1));

                    const poolToken = await Contracts.PoolToken.attach(pool.poolToken);
                    expect(poolToken).not.to.equal(ZERO_ADDRESS);
                    expect(await poolCollection.poolToken(reserveToken.address)).to.equal(pool.poolToken);
                    expect(await poolToken.reserveToken()).to.equal(reserveToken.address);

                    expect(pool.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);
                    expect(pool.tradingEnabled).to.be.false;
                    expect(pool.depositingEnabled).to.be.true;
                    expect(pool.averageRate.time).to.equal(0);
                    expect(pool.averageRate.rate).to.equal(ZERO_FRACTION);
                    expect(pool.depositLimit).to.equal(0);

                    const { liquidity } = pool;
                    expect(liquidity.baseTokenTradingLiquidity).to.equal(0);
                    expect(liquidity.networkTokenTradingLiquidity).to.equal(0);
                    expect(liquidity.stakedBalance).to.equal(0);

                    const poolLiquidity = await poolCollection.poolLiquidity(reserveToken.address);
                    expect(poolLiquidity.baseTokenTradingLiquidity).to.equal(liquidity.baseTokenTradingLiquidity);
                    expect(poolLiquidity.networkTokenTradingLiquidity).to.equal(liquidity.networkTokenTradingLiquidity);
                    expect(poolLiquidity.stakedBalance).to.equal(liquidity.stakedBalance);
                });
            });
        };

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testCreatePool(new TokenData(symbol));
            });
        }
    });

    describe('settings', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let poolCollection: TestPoolCollection;
        let newReserveToken: TestERC20Token;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, poolCollection } = await createSystem());

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            newReserveToken = await createTestToken();
        });

        describe('setting the trading fee', () => {
            const newTradingFee = toPPM(5.5);

            it('should revert when a non-owner attempts to set the trading fee', async () => {
                await expect(
                    poolCollection.connect(nonOwner).setTradingFeePPM(reserveToken.address, newTradingFee)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when setting an invalid trading fee', async () => {
                await expect(
                    poolCollection.setTradingFeePPM(reserveToken.address, PPM_RESOLUTION + 1)
                ).to.be.revertedWith('InvalidFee');
            });

            it('should revert when setting the trading fee of a non-existing pool', async () => {
                await expect(
                    poolCollection.setTradingFeePPM(newReserveToken.address, newTradingFee)
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should ignore updating to the same trading fee', async () => {
                await poolCollection.setTradingFeePPM(reserveToken.address, newTradingFee);

                const res = await poolCollection.setTradingFeePPM(reserveToken.address, newTradingFee);
                await expect(res).not.to.emit(poolCollection, 'TradingFeePPMUpdated');
            });

            it('should allow setting and updating the trading fee', async () => {
                let pool = await poolCollection.poolData(reserveToken.address);
                let { tradingFeePPM } = pool;
                expect(tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);

                const res = await poolCollection.setTradingFeePPM(reserveToken.address, newTradingFee);
                await expect(res)
                    .to.emit(poolCollection, 'TradingFeePPMUpdated')
                    .withArgs(reserveToken.address, tradingFeePPM, newTradingFee);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ tradingFeePPM } = pool);
                expect(tradingFeePPM).to.equal(newTradingFee);

                const newTradingFee2 = toPPM(0);
                const res2 = await poolCollection.setTradingFeePPM(reserveToken.address, newTradingFee2);
                await expect(res2)
                    .to.emit(poolCollection, 'TradingFeePPMUpdated')
                    .withArgs(reserveToken.address, tradingFeePPM, newTradingFee2);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ tradingFeePPM } = pool);
                expect(tradingFeePPM).to.equal(newTradingFee2);
            });
        });

        describe('enabling/disabling depositing', () => {
            it('should revert when a non-owner attempts to enable depositing', async () => {
                await expect(
                    poolCollection.connect(nonOwner).enableDepositing(reserveToken.address, true)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when enabling depositing for a non-existing pool', async () => {
                await expect(poolCollection.enableDepositing(newReserveToken.address, true)).to.be.revertedWith(
                    'DoesNotExist'
                );
            });

            it('should ignore updating to the same status', async () => {
                await poolCollection.enableDepositing(reserveToken.address, false);

                const res = await poolCollection.enableDepositing(reserveToken.address, false);
                await expect(res).not.to.emit(poolCollection, 'DepositingEnabled');
            });

            it('should allow enabling and disabling depositing', async () => {
                let pool = await poolCollection.poolData(reserveToken.address);
                let { depositingEnabled } = pool;
                expect(depositingEnabled).to.be.true;

                const res = await poolCollection.enableDepositing(reserveToken.address, false);
                await expect(res).to.emit(poolCollection, 'DepositingEnabled').withArgs(reserveToken.address, false);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ depositingEnabled } = pool);
                expect(depositingEnabled).to.be.false;

                const res2 = await poolCollection.enableDepositing(reserveToken.address, true);
                await expect(res2).to.emit(poolCollection, 'DepositingEnabled').withArgs(reserveToken.address, true);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ depositingEnabled } = pool);
                expect(depositingEnabled).to.be.true;
            });
        });

        describe('setting the deposit limit', () => {
            const newDepositLimit = 99_999;

            it('should revert when a non-owner attempts to set the deposit limit', async () => {
                await expect(
                    poolCollection.connect(nonOwner).setDepositLimit(reserveToken.address, newDepositLimit)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when setting the deposit limit of a non-existing pool', async () => {
                await expect(
                    poolCollection.setDepositLimit(newReserveToken.address, newDepositLimit)
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should ignore updating to the same deposit limit', async () => {
                await poolCollection.setDepositLimit(reserveToken.address, newDepositLimit);

                const res = await poolCollection.setDepositLimit(reserveToken.address, newDepositLimit);
                await expect(res).not.to.emit(poolCollection, 'DepositLimitUpdated');
            });

            it('should allow setting and updating the deposit limit', async () => {
                let pool = await poolCollection.poolData(reserveToken.address);
                let { depositLimit } = pool;
                expect(depositLimit).to.equal(0);

                const res = await poolCollection.setDepositLimit(reserveToken.address, newDepositLimit);
                await expect(res)
                    .to.emit(poolCollection, 'DepositLimitUpdated')
                    .withArgs(reserveToken.address, depositLimit, newDepositLimit);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ depositLimit } = pool);
                expect(depositLimit).to.equal(newDepositLimit);

                const newDepositLimit2 = 1;
                const res2 = await poolCollection.setDepositLimit(reserveToken.address, newDepositLimit2);
                await expect(res2)
                    .to.emit(poolCollection, 'DepositLimitUpdated')
                    .withArgs(reserveToken.address, depositLimit, newDepositLimit2);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ depositLimit } = pool);
                expect(depositLimit).to.equal(newDepositLimit2);
            });
        });
    });

    describe('enable trading', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;

        let provider: SignerWithAddress;
        let token: TokenWithAddress;

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkToken, networkSettings, masterPool, masterVault, poolCollection } =
                await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const testActivation = async (tokenData: TokenData) => {
            const testEnableTrading = async (totalLiquidity: BigNumber) => {
                expect(await masterPool.currentPoolFunding(token.address)).to.equal(0);

                const { liquidity: prevLiquidity } = await poolCollection.poolData(token.address);

                const res = await poolCollection.enableTrading(token.address, FUNDING_RATE);

                const data = await poolCollection.poolData(token.address);
                const { liquidity } = data;

                expect(data.averageRate.time).to.equal(await poolCollection.currentTime());
                expect(data.averageRate.rate).to.equal(FUNDING_RATE);

                expect(data.tradingEnabled).to.be.true;

                expect(liquidity.networkTokenTradingLiquidity).to.equal(
                    MIN_LIQUIDITY_FOR_TRADING.mul(BOOTSTRAPPING_LIQUIDITY_BUFFER_FACTOR)
                );
                expect(liquidity.baseTokenTradingLiquidity).to.equal(
                    liquidity.networkTokenTradingLiquidity.mul(FUNDING_RATE.d).div(FUNDING_RATE.n)
                );
                expect(liquidity.stakedBalance).to.equal(totalLiquidity);

                // ensure that the new network token funding was requested
                expect(await masterPool.currentPoolFunding(token.address)).to.equal(
                    liquidity.networkTokenTradingLiquidity
                );

                await expect(res)
                    .to.emit(poolCollection, 'TradingEnabled')
                    .withArgs(token.address, true, TradingStatusUpdateReason.Admin);

                await testTradingLiquidityEvents(
                    token,
                    poolCollection,
                    masterVault,
                    networkToken,
                    prevLiquidity,
                    liquidity,
                    ZERO_BYTES32,
                    res
                );
            };

            beforeEach(async () => {
                if (tokenData.isNetworkToken()) {
                    token = networkToken;
                } else {
                    token = await createToken(tokenData);
                }

                await createPool(token, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(token.address, MAX_UINT256);

                await poolCollection.setDepositLimit(token.address, MAX_UINT256);
            });

            it('should revert when a non-owner attempts to enable trading', async () => {
                await expect(
                    poolCollection.connect(nonOwner).enableTrading(token.address, FUNDING_RATE)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when enabling trading an invalid pool', async () => {
                await expect(poolCollection.enableTrading(ZERO_ADDRESS, FUNDING_RATE)).to.be.revertedWith(
                    'DoesNotExist'
                );
            });

            it('should revert when enabling trading a non-existing pool', async () => {
                const newReserveToken = await createTestToken();
                await expect(poolCollection.enableTrading(newReserveToken.address, FUNDING_RATE)).to.be.revertedWith(
                    'DoesNotExist'
                );
            });

            it('should revert when enabling trading with an invalid funding rate', async () => {
                await expect(poolCollection.enableTrading(token.address, ZERO_FRACTION)).to.be.revertedWith(
                    'InvalidRate'
                );
            });

            context('when no base token liquidity was deposited', () => {
                it('should revert', async () => {
                    await expect(poolCollection.enableTrading(token.address, FUNDING_RATE)).to.be.revertedWith(
                        'InsufficientLiquidity'
                    );
                });
            });

            context('with a base token liquidity deposit', () => {
                const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(FUNDING_RATE.d).div(FUNDING_RATE.n).mul(1000);

                beforeEach(async () => {
                    await depositToPool(provider, token, INITIAL_LIQUIDITY, network);
                });

                it('should enable trading', async () => {
                    await testEnableTrading(INITIAL_LIQUIDITY);
                });

                it('should revert when attempting to enable trading twice', async () => {
                    await poolCollection.enableTrading(token.address, FUNDING_RATE);
                    await expect(poolCollection.enableTrading(token.address, FUNDING_RATE)).to.be.revertedWith(
                        'TradingIsEnabled'
                    );
                });

                context('when the pool funding limit is below the minimum liquidity for trading', () => {
                    beforeEach(async () => {
                        await networkSettings.setFundingLimit(token.address, MIN_LIQUIDITY_FOR_TRADING.sub(1));
                    });

                    it('should revert', async () => {
                        await expect(poolCollection.enableTrading(token.address, FUNDING_RATE)).to.be.revertedWith(
                            'InsufficientLiquidity'
                        );
                    });
                });

                context('when the matched target network liquidity is below the minimum liquidity for trading', () => {
                    it('should revert', async () => {
                        // use a funding rate such that the resulting matched target network liquidity is insufficient
                        await expect(
                            poolCollection.enableTrading(token.address, {
                                n: MIN_LIQUIDITY_FOR_TRADING.sub(1),
                                d: INITIAL_LIQUIDITY
                            })
                        ).to.be.revertedWith('InsufficientLiquidity');
                    });
                });
            });

            context('with multiple base token liquidity deposits', () => {
                const DEPOSITS_COUNT = 10;
                const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(FUNDING_RATE.d).div(FUNDING_RATE.n);
                const TOTAL_INITIAL_LIQUIDITY = INITIAL_LIQUIDITY.mul(DEPOSITS_COUNT);

                beforeEach(async () => {
                    for (let i = 0; i < DEPOSITS_COUNT; i++) {
                        await depositToPool(provider, token, INITIAL_LIQUIDITY, network);
                    }
                });

                it('should enable trading', async () => {
                    await testEnableTrading(TOTAL_INITIAL_LIQUIDITY);
                });
            });
        };

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testActivation(new TokenData(symbol));
            });
        }
    });

    describe('disable trading', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: TestMasterPool;
        let poolCollection: TestPoolCollection;

        let provider: SignerWithAddress;
        let token: TokenWithAddress;

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, networkToken, networkSettings, masterPool, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const testDisableTrading = async (tokenData: TokenData) => {
            const testReset = async (expectedStakedBalance: BigNumberish) => {
                const { tradingEnabled: prevTradingEnabled } = await poolCollection.poolData(token.address);
                const res = await poolCollection.disableTrading(token.address);

                return testLiquidityReset(
                    token,
                    poolCollection,
                    masterPool,
                    prevTradingEnabled,
                    res,
                    expectedStakedBalance,
                    0,
                    TradingStatusUpdateReason.Admin
                );
            };

            beforeEach(async () => {
                if (tokenData.isNetworkToken()) {
                    token = networkToken;
                } else {
                    token = await createToken(tokenData);
                }

                await createPool(token, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(token.address, MAX_UINT256);

                await poolCollection.setDepositLimit(token.address, MAX_UINT256);
            });

            it('should revert when a non-owner attempts to disable trading', async () => {
                await expect(poolCollection.connect(nonOwner).disableTrading(token.address)).to.be.revertedWith(
                    'AccessDenied'
                );
            });

            it('should revert when disabling trading of an invalid pool', async () => {
                await expect(poolCollection.disableTrading(ZERO_ADDRESS)).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when disabling trading of a non-existing pool', async () => {
                const newReserveToken = await createTestToken();
                await expect(poolCollection.disableTrading(newReserveToken.address)).to.be.revertedWith('DoesNotExist');
            });

            context('when trading is disabled', () => {
                beforeEach(async () => {
                    const data = await poolCollection.poolData(token.address);
                    const { liquidity } = data;

                    expect(data.tradingEnabled).to.be.false;
                    expect(liquidity.networkTokenTradingLiquidity).to.equal(0);
                    expect(liquidity.baseTokenTradingLiquidity).to.equal(0);
                    expect(liquidity.stakedBalance).to.equal(0);
                });

                it('should reset the trading liquidity', async () => {
                    await testReset(0);
                });
            });

            context('when trading is enabled', () => {
                const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(FUNDING_RATE.d).div(FUNDING_RATE.n).mul(10_000);

                beforeEach(async () => {
                    await depositToPool(provider, token, INITIAL_LIQUIDITY, network);

                    await poolCollection.enableTrading(token.address, FUNDING_RATE);

                    const { tradingEnabled } = await poolCollection.poolData(token.address);
                    expect(tradingEnabled).to.be.true;
                });

                it('should reset the trading liquidity', async () => {
                    await testReset(INITIAL_LIQUIDITY);
                });

                context('with an initialized average rate', () => {
                    beforeEach(async () => {
                        await poolCollection.setAverageRateT(token.address, {
                            time: 1000,
                            rate: {
                                n: 1234,
                                d: 100
                            }
                        });

                        const data = await poolCollection.poolData(token.address);
                        const { averageRate } = data;

                        expect(averageRate.time).to.be.gte(0);
                        expect(averageRate.rate.n).to.be.gte(0);
                        expect(averageRate.rate.d).to.be.gte(0);
                    });

                    it('should reset the trading liquidity', async () => {
                        await testReset(INITIAL_LIQUIDITY);
                    });
                });
            });
        };

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testDisableTrading(new TokenData(symbol));
            });
        }
    });

    describe('deposit', () => {
        const testDeposit = (tokenData: TokenData) => {
            let networkSettings: NetworkSettings;
            let network: TestBancorNetwork;
            let networkToken: IERC20;
            let masterPool: MasterPool;
            let masterVault: MasterVault;
            let poolCollection: TestPoolCollection;
            let token: TokenWithAddress;

            let provider: SignerWithAddress;

            before(async () => {
                [, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ network, networkToken, networkSettings, masterPool, masterVault, poolCollection } =
                    await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
                await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);

                token = await createToken(tokenData);
            });

            it('should revert when attempting to deposit from a non-network', async () => {
                const nonNetwork = deployer;

                await expect(
                    poolCollection.connect(nonNetwork).depositFor(CONTEXT_ID, provider.address, token.address, 1)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to deposit for an invalid provider', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        CONTEXT_ID,
                        ZERO_ADDRESS,
                        token.address,
                        1
                    )
                ).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to deposit for an invalid pool', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        ZERO_ADDRESS,
                        1
                    )
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when attempting to deposit into a non-existing pool', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        token.address,
                        1
                    )
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when attempting to deposit an invalid amount', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        token.address,
                        0
                    )
                ).to.be.revertedWith('ZeroValue');
            });

            context('with a registered pool', () => {
                let poolToken: PoolToken;

                const DEPOSIT_LIMIT = toWei(1_000_000_000_000);
                const COUNT = 3;
                const AMOUNT = toWei(10_000);

                beforeEach(async () => {
                    poolToken = await createPool(token, network, networkSettings, poolCollection);

                    await networkSettings.setFundingLimit(token.address, MAX_UINT256);

                    await poolCollection.setDepositLimit(token.address, DEPOSIT_LIMIT);

                    await transfer(deployer, token, masterVault, AMOUNT.mul(COUNT));

                    await poolCollection.setTime(await latest());
                });

                enum TradingLiquidityState {
                    Reset = 0,
                    Ignore = 1,
                    Update = 2
                }

                const testDepositFor = async (
                    tokenAmount: BigNumberish,
                    expectTradingLiquidity: TradingLiquidityState
                ) => {
                    const {
                        tradingEnabled: prevTradingEnabled,
                        averageRate: prevAverageRate,
                        liquidity: prevLiquidity
                    } = await poolCollection.poolData(token.address);

                    const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                    const prevProviderPoolTokenBalance = await poolToken.balanceOf(provider.address);
                    const prevFunding = await masterPool.currentPoolFunding(token.address);

                    let expectedPoolTokenAmount;
                    if (prevPoolTokenTotalSupply.isZero()) {
                        expectedPoolTokenAmount = tokenAmount;
                    } else {
                        expectedPoolTokenAmount = BigNumber.from(tokenAmount)
                            .mul(prevPoolTokenTotalSupply)
                            .div(prevLiquidity.stakedBalance);
                    }

                    const res = await network.depositToPoolCollectionForT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        token.address,
                        tokenAmount
                    );

                    await expect(res)
                        .to.emit(poolCollection, 'TokenDeposited')
                        .withArgs(CONTEXT_ID, token.address, provider.address, tokenAmount, expectedPoolTokenAmount);

                    const poolData = await poolCollection.poolData(token.address);
                    const { liquidity } = poolData;

                    await testTradingLiquidityEvents(
                        token,
                        poolCollection,
                        masterVault,
                        networkToken,
                        prevLiquidity,
                        liquidity,
                        CONTEXT_ID,
                        res
                    );

                    expect(await poolToken.totalSupply()).to.equal(
                        prevPoolTokenTotalSupply.add(expectedPoolTokenAmount)
                    );
                    expect(await poolToken.balanceOf(provider.address)).to.equal(
                        prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                    );

                    expect(liquidity.stakedBalance).to.equal(prevLiquidity.stakedBalance.add(tokenAmount));

                    switch (expectTradingLiquidity) {
                        case TradingLiquidityState.Reset:
                            await testLiquidityReset(
                                token,
                                poolCollection,
                                masterPool,
                                prevTradingEnabled,
                                res,
                                prevLiquidity.stakedBalance.add(tokenAmount),
                                prevFunding.sub(prevLiquidity.networkTokenTradingLiquidity),
                                TradingStatusUpdateReason.MinLiquidity
                            );

                            expect(liquidity.networkTokenTradingLiquidity).to.equal(0);
                            expect(liquidity.baseTokenTradingLiquidity).to.equal(0);

                            break;

                        case TradingLiquidityState.Ignore:
                            expect(liquidity.networkTokenTradingLiquidity).to.equal(
                                prevLiquidity.networkTokenTradingLiquidity
                            );
                            expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                prevLiquidity.baseTokenTradingLiquidity
                            );

                            break;

                        case TradingLiquidityState.Update:
                            {
                                expect(prevLiquidity.networkTokenTradingLiquidity).to.be.gte(0);

                                let targetNetworkTokenTradingLiquidity = BigNumber.min(
                                    BigNumber.min(
                                        await networkSettings.poolFundingLimit(token.address),
                                        prevLiquidity.baseTokenTradingLiquidity
                                            .mul(prevAverageRate.rate.n)
                                            .div(prevAverageRate.rate.d)
                                    ),
                                    prevLiquidity.networkTokenTradingLiquidity.add(
                                        await masterPool.availableFunding(token.address)
                                    )
                                );

                                if (
                                    targetNetworkTokenTradingLiquidity.gte(prevLiquidity.networkTokenTradingLiquidity)
                                ) {
                                    targetNetworkTokenTradingLiquidity = BigNumber.min(
                                        targetNetworkTokenTradingLiquidity,
                                        prevLiquidity.networkTokenTradingLiquidity.mul(LIQUIDITY_GROWTH_FACTOR)
                                    );
                                } else {
                                    targetNetworkTokenTradingLiquidity = BigNumber.max(
                                        targetNetworkTokenTradingLiquidity,
                                        prevLiquidity.networkTokenTradingLiquidity.div(LIQUIDITY_GROWTH_FACTOR)
                                    );
                                }

                                // ensure that the new network token funding was updated

                                if (targetNetworkTokenTradingLiquidity.gt(prevLiquidity.networkTokenTradingLiquidity)) {
                                    expect(await masterPool.currentPoolFunding(token.address)).to.equal(
                                        prevFunding.add(
                                            targetNetworkTokenTradingLiquidity.sub(
                                                prevLiquidity.networkTokenTradingLiquidity
                                            )
                                        )
                                    );
                                } else if (
                                    targetNetworkTokenTradingLiquidity.lt(prevLiquidity.networkTokenTradingLiquidity)
                                ) {
                                    expect(await masterPool.currentPoolFunding(token.address)).to.equal(
                                        prevFunding.sub(
                                            prevLiquidity.networkTokenTradingLiquidity.sub(
                                                targetNetworkTokenTradingLiquidity
                                            )
                                        )
                                    );
                                }
                            }

                            break;
                    }
                };

                const testMultipleDepositsFor = async (
                    tokenAmount: BigNumberish,
                    count: number,
                    expectTradingLiquidity: TradingLiquidityState
                ) => {
                    for (let i = 0; i < count; i++) {
                        await testDepositFor(tokenAmount, expectTradingLiquidity);
                    }
                };

                context('when trading is disabled', () => {
                    context('when at the deposit limit', () => {
                        beforeEach(async () => {
                            await network.depositToPoolCollectionForT(
                                poolCollection.address,
                                CONTEXT_ID,
                                provider.address,
                                token.address,
                                DEPOSIT_LIMIT
                            );
                        });

                        it('should revert', async () => {
                            await expect(
                                network.depositToPoolCollectionForT(
                                    poolCollection.address,
                                    CONTEXT_ID,
                                    provider.address,
                                    token.address,
                                    1
                                )
                            ).to.be.revertedWith('DepositLimitExceeded');
                        });
                    });

                    context('when below the deposit limit', () => {
                        it('should deposit and reset the trading liquidity', async () => {
                            await testMultipleDepositsFor(AMOUNT, COUNT, TradingLiquidityState.Reset);
                        });
                    });
                });

                context('when trading is enabled', () => {
                    const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(FUNDING_RATE.d)
                        .div(FUNDING_RATE.n)
                        .mul(1000);

                    beforeEach(async () => {
                        await depositToPool(provider, token, INITIAL_LIQUIDITY, network);

                        await poolCollection.enableTrading(token.address, FUNDING_RATE);

                        const { tradingEnabled } = await poolCollection.poolData(token.address);
                        expect(tradingEnabled).to.be.true;
                    });

                    context('when at the deposit limit', () => {
                        beforeEach(async () => {
                            await network.depositToPoolCollectionForT(
                                poolCollection.address,
                                CONTEXT_ID,
                                provider.address,
                                token.address,
                                DEPOSIT_LIMIT.sub(INITIAL_LIQUIDITY)
                            );
                        });

                        it('should revert', async () => {
                            await expect(
                                network.depositToPoolCollectionForT(
                                    poolCollection.address,
                                    CONTEXT_ID,
                                    provider.address,
                                    token.address,
                                    1
                                )
                            ).to.be.revertedWith('DepositLimitExceeded');
                        });
                    });

                    context('when below the deposit limit', () => {
                        context(
                            'when the network token liquidity for trading is below the minimum liquidity for trading',
                            () => {
                                beforeEach(async () => {
                                    const { baseTokenTradingLiquidity, stakedBalance } =
                                        await poolCollection.poolLiquidity(token.address);

                                    await poolCollection.setTradingLiquidityT(token.address, {
                                        networkTokenTradingLiquidity: MIN_LIQUIDITY_FOR_TRADING.sub(1),
                                        baseTokenTradingLiquidity,
                                        stakedBalance
                                    });
                                });

                                it('should deposit and reset the trading liquidity', async () => {
                                    await testMultipleDepositsFor(AMOUNT, COUNT, TradingLiquidityState.Reset);
                                });
                            }
                        );

                        context('when the pool is unstable', () => {
                            const SPOT_RATE = {
                                n: toWei(1_000_000),
                                d: toWei(10_000_000)
                            };

                            beforeEach(async () => {
                                const { stakedBalance } = await poolCollection.poolLiquidity(token.address);

                                await poolCollection.setTradingLiquidityT(token.address, {
                                    networkTokenTradingLiquidity: SPOT_RATE.n,
                                    baseTokenTradingLiquidity: SPOT_RATE.d,
                                    stakedBalance
                                });

                                await poolCollection.setAverageRateT(token.address, {
                                    rate: {
                                        n: SPOT_RATE.n.mul(PPM_RESOLUTION),
                                        d: SPOT_RATE.d.mul(PPM_RESOLUTION + MAX_DEVIATION + toPPM(0.5))
                                    },
                                    time: await poolCollection.currentTime()
                                });

                                expect(await poolCollection.isPoolRateStable(token.address)).to.be.false;
                            });

                            it('should deposit liquidity and preserve the trading liquidity', async () => {
                                await testMultipleDepositsFor(AMOUNT, COUNT, TradingLiquidityState.Ignore);
                            });
                        });

                        context('when the pool is stable', () => {
                            beforeEach(async () => {
                                const { liquidity } = await poolCollection.poolData(token.address);

                                await poolCollection.setAverageRateT(token.address, {
                                    rate: {
                                        n: liquidity.networkTokenTradingLiquidity,
                                        d: liquidity.baseTokenTradingLiquidity
                                    },
                                    time: await poolCollection.currentTime()
                                });

                                expect(await poolCollection.isPoolRateStable(token.address)).to.be.true;
                            });

                            it('should deposit and update the trading liquidity', async () => {
                                await testMultipleDepositsFor(AMOUNT, COUNT, TradingLiquidityState.Update);
                            });

                            context('when the pool funding limit is below the minimum liquidity for trading', () => {
                                beforeEach(async () => {
                                    await networkSettings.setFundingLimit(
                                        token.address,
                                        MIN_LIQUIDITY_FOR_TRADING.sub(1)
                                    );
                                });

                                it('should deposit and reset the trading liquidity', async () => {
                                    await testMultipleDepositsFor(AMOUNT, COUNT, TradingLiquidityState.Reset);
                                });
                            });

                            context(
                                'when the matched target network liquidity is below the minimum liquidity for trading',
                                () => {
                                    beforeEach(async () => {
                                        await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                                    });

                                    it('should deposit and reset the trading liquidity', async () => {
                                        await testMultipleDepositsFor(AMOUNT, COUNT, TradingLiquidityState.Reset);
                                    });
                                }
                            );

                            context(
                                'when the matched target network liquidity is below the current network liquidity',
                                () => {
                                    beforeEach(async () => {
                                        // ensure that the pool grew a bit and then retroactive reduce the funding
                                        // limit to 0 to force the shrinking of the pool
                                        await testMultipleDepositsFor(AMOUNT, COUNT, TradingLiquidityState.Update);

                                        await networkSettings.setFundingLimit(token.address, MIN_LIQUIDITY_FOR_TRADING);
                                    });

                                    it('should deposit and update the trading liquidity', async () => {
                                        await testMultipleDepositsFor(AMOUNT, COUNT, TradingLiquidityState.Update);
                                    });
                                }
                            );
                        });
                    });
                });
            });
        };

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testDeposit(new TokenData(symbol));
            });
        }
    });

    describe('withdraw', () => {
        const testWithdrawal = (tokenData: TokenData) => {
            let networkSettings: NetworkSettings;
            let network: TestBancorNetwork;
            let networkToken: IERC20;
            let poolCollection: TestPoolCollection;
            let masterVault: MasterVault;
            let masterPool: TestMasterPool;
            let poolToken: PoolToken;
            let token: TokenWithAddress;

            let provider: SignerWithAddress;

            before(async () => {
                [, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ network, networkToken, networkSettings, masterVault, masterPool, poolCollection } =
                    await createSystem());

                token = await createToken(tokenData);

                poolToken = await createPool(token, network, networkSettings, poolCollection);

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
                await networkSettings.setFundingLimit(token.address, MAX_UINT256);

                await poolCollection.setDepositLimit(token.address, MAX_UINT256);

                await poolCollection.setTime(await latest());
            });

            enum TradingLiquidityState {
                Reset = 0,
                Update = 1
            }

            const testWithdraw = async (
                poolTokenAmount: BigNumberish,
                expectTradingLiquidity: TradingLiquidityState
            ) => {
                const { liquidity: prevLiquidity, tradingEnabled: prevTradingEnabled } = await poolCollection.poolData(
                    token.address
                );

                await poolToken.connect(provider).transfer(network.address, poolTokenAmount);
                await network.approveT(poolToken.address, poolCollection.address, poolTokenAmount);

                const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                const prevNetworkPoolTokenBalance = await poolToken.balanceOf(network.address);

                // TODO: these calculation are currently wrong and should be replaced with withdrawalAmounts
                //
                // const expectedBaseTokenAmount = await poolCollection.poolTokenToUnderlying(
                //     token.address,
                //     poolTokenAmount
                // );

                // const expectedStakedBalance = prevLiquidity.stakedBalance.sub(expectedBaseTokenAmount);
                // const expectedBaseTokenTradingLiquidity =
                //     prevLiquidity.baseTokenTradingLiquidity.sub(expectedBaseTokenAmount);
                // const expectedNetworkTokenTradingLiquidity = prevLiquidity.networkTokenTradingLiquidity;
                // const expectedTradingLiquidityProduct = expectedBaseTokenTradingLiquidity.mul(
                //     expectedNetworkTokenTradingLiquidity
                // );

                const withdrawalAmounts = await poolCollection.poolWithdrawalAmountsT(token.address, poolTokenAmount);

                const expectedStakedBalance = prevLiquidity.stakedBalance
                    .mul(prevPoolTokenTotalSupply.sub(poolTokenAmount))
                    .div(prevPoolTokenTotalSupply);

                const res = await network.withdrawFromPoolCollectionT(
                    poolCollection.address,
                    CONTEXT_ID,
                    provider.address,
                    token.address,
                    poolTokenAmount
                );

                await expect(res)
                    .to.emit(poolCollection, 'TokenWithdrawn')
                    .withArgs(
                        CONTEXT_ID,
                        token.address,
                        provider.address,
                        withdrawalAmounts.baseTokensToTransferFromMasterVault,
                        poolTokenAmount,
                        withdrawalAmounts.baseTokensToTransferFromEPV,
                        withdrawalAmounts.networkTokensToMintForProvider,
                        withdrawalAmounts.baseTokensWithdrawalFee
                    );

                const { liquidity } = await poolCollection.poolData(token.address);

                await testTradingLiquidityEvents(
                    token,
                    poolCollection,
                    masterVault,
                    networkToken,
                    prevLiquidity,
                    liquidity,
                    CONTEXT_ID,
                    res
                );

                expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply.sub(poolTokenAmount));
                expect(await poolToken.balanceOf(network.address)).to.equal(
                    prevNetworkPoolTokenBalance.sub(poolTokenAmount)
                );

                switch (expectTradingLiquidity) {
                    case TradingLiquidityState.Reset:
                        await testLiquidityReset(
                            token,
                            poolCollection,
                            masterPool,
                            prevTradingEnabled,
                            res,
                            expectedStakedBalance,
                            0,
                            TradingStatusUpdateReason.MinLiquidity
                        );

                        expect(liquidity.networkTokenTradingLiquidity).to.equal(0);
                        expect(liquidity.baseTokenTradingLiquidity).to.equal(0);

                        break;

                    case TradingLiquidityState.Update:
                        // TODO: restore when other issues are fixed
                        // expect(liquidity.stakedBalance).to.equal(expectedStakedBalance);
                        // expect(liquidity.baseTokenTradingLiquidity).to.equal(expectedBaseTokenTradingLiquidity);
                        // expect(liquidity.networkTokenTradingLiquidity).to.equal(expectedNetworkTokenTradingLiquidity);

                        break;
                }
            };

            const testMultipleWithdrawals = async (
                totalBasePoolTokenAmount: BigNumberish,
                count: number,
                expectTradingLiquidity: TradingLiquidityState
            ) => {
                for (let i = 0; i < count; i++) {
                    await testWithdraw(BigNumber.from(totalBasePoolTokenAmount).div(count), expectTradingLiquidity);
                }
            };

            it('should revert when attempting to withdraw from a non-network', async () => {
                const nonNetwork = deployer;

                await expect(
                    poolCollection.connect(nonNetwork).withdraw(CONTEXT_ID, provider.address, token.address, 1)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to withdraw from an invalid pool', async () => {
                await expect(
                    network.withdrawFromPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        ZERO_ADDRESS,
                        1
                    )
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when attempting to withdraw from a non-existing pool', async () => {
                const newReserveToken = await createTestToken();
                await expect(
                    network.withdrawFromPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        newReserveToken.address,
                        1
                    )
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when attempting to withdraw an invalid amount', async () => {
                await expect(
                    network.withdrawFromPoolCollectionT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        token.address,
                        0
                    )
                ).to.be.revertedWith('ZeroValue');
            });

            context('with deposited funds', () => {
                const COUNT = 3;
                const AMOUNT = toWei(1_000_000);

                let totalBasePoolTokenAmount: BigNumber;

                beforeEach(async () => {
                    for (let i = 0; i < COUNT; i++) {
                        await transfer(deployer, token, masterVault, AMOUNT);

                        const prevBasePoolTokenBalance = await poolToken.balanceOf(provider.address);

                        await network.depositToPoolCollectionForT(
                            poolCollection.address,
                            CONTEXT_ID,
                            provider.address,
                            token.address,
                            AMOUNT
                        );

                        totalBasePoolTokenAmount = (await poolToken.balanceOf(provider.address)).sub(
                            prevBasePoolTokenBalance
                        );
                    }
                });

                // TODO: we need to fix PoolCollectionWithdrawal::calculateWithdrawalAmounts in order for withdrawals
                // from an inactive pool to work
                context.skip('when trading is disabled', () => {
                    it('should withdraw', async () => {
                        await testMultipleWithdrawals(totalBasePoolTokenAmount, COUNT, TradingLiquidityState.Update);
                    });

                    context(
                        'when the matched target network liquidity is below the minimum liquidity for trading',
                        () => {
                            beforeEach(async () => {
                                await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                            });

                            it('should withdraw and reset the trading liquidity', async () => {
                                await testMultipleWithdrawals(
                                    totalBasePoolTokenAmount,
                                    COUNT,
                                    TradingLiquidityState.Reset
                                );
                            });
                        }
                    );
                });

                context('when trading is enabled', () => {
                    beforeEach(async () => {
                        await poolCollection.enableTrading(token.address, FUNDING_RATE);
                    });

                    it('should withdraw', async () => {
                        await testMultipleWithdrawals(totalBasePoolTokenAmount, COUNT, TradingLiquidityState.Update);
                    });

                    context(
                        'when the matched target network liquidity is below the minimum liquidity for trading',
                        () => {
                            beforeEach(async () => {
                                await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                            });

                            it.skip('should withdraw and reset the trading liquidity', async () => {
                                await testMultipleWithdrawals(
                                    totalBasePoolTokenAmount,
                                    COUNT,
                                    TradingLiquidityState.Reset
                                );
                            });
                        }
                    );

                    // TODO: we need to fix PoolCollectionWithdrawal::calculateWithdrawalAmounts in order for withdrawals
                    // from an inactive pool to work
                    context.skip('after disabling trading', () => {
                        beforeEach(async () => {
                            await poolCollection.disableTrading(token.address);
                        });

                        it('should withdraw', async () => {
                            await testMultipleWithdrawals(
                                totalBasePoolTokenAmount,
                                COUNT,
                                TradingLiquidityState.Update
                            );
                        });

                        context(
                            'when the matched target network liquidity is below the minimum liquidity for trading',
                            () => {
                                beforeEach(async () => {
                                    await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                                });

                                it('should withdraw and reset the trading liquidity', async () => {
                                    await testMultipleWithdrawals(
                                        totalBasePoolTokenAmount,
                                        COUNT,
                                        TradingLiquidityState.Reset
                                    );
                                });
                            }
                        );
                    });
                });
            });
        };

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            context(symbol, () => {
                testWithdrawal(new TokenData(symbol));
            });
        }
    });

    describe('trading', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let masterPool: MasterPool;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const MIN_RETURN_AMOUNT = 1;

        beforeEach(async () => {
            ({ network, networkToken, networkSettings, masterPool, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
            await networkSettings.setAverageRateMaxDeviationPPM(MAX_DEVIATION);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

            await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);

            await poolCollection.setTime(await latest());
        });

        const testTrading = (isSourceNetworkToken: boolean) => {
            const setTradingLiquidity = async (
                networkTokenTradingLiquidity: BigNumberish,
                baseTokenTradingLiquidity: BigNumberish
            ) =>
                poolCollection.setTradingLiquidityT(reserveToken.address, {
                    networkTokenTradingLiquidity,
                    baseTokenTradingLiquidity,
                    stakedBalance: baseTokenTradingLiquidity
                });

            const fromTokenName = isSourceNetworkToken ? 'network token' : 'base token';
            const toTokenName = isSourceNetworkToken ? 'base token' : 'network token';

            context(`from ${fromTokenName} to ${toTokenName}`, () => {
                let sourceToken: IERC20;
                let targetToken: IERC20;

                beforeEach(async () => {
                    sourceToken = isSourceNetworkToken ? networkToken : reserveToken;
                    targetToken = isSourceNetworkToken ? reserveToken : networkToken;
                });

                context('when trading is disabled', () => {
                    beforeEach(async () => {
                        await poolCollection.disableTrading(reserveToken.address);
                    });

                    it('should revert when attempting to trade or query', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('TradingIsDisabled');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(
                                    sourceToken.address,
                                    targetToken.address,
                                    1,
                                    targetAmount
                                )
                            ).to.be.revertedWith('TradingIsDisabled');
                        }
                    });
                });

                context('when trading is enabled', () => {
                    const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(FUNDING_RATE.d)
                        .div(FUNDING_RATE.n)
                        .mul(10_000);

                    beforeEach(async () => {
                        await depositToPool(deployer, reserveToken, INITIAL_LIQUIDITY, network);

                        await poolCollection.enableTrading(reserveToken.address, FUNDING_RATE);
                    });

                    it('should revert when attempting to trade from a non-network', async () => {
                        const nonNetwork = deployer;

                        await expect(
                            poolCollection
                                .connect(nonNetwork)
                                .trade(CONTEXT_ID, sourceToken.address, targetToken.address, 1, MIN_RETURN_AMOUNT)
                        ).to.be.revertedWith('AccessDenied');
                    });

                    it('should revert when attempting to trade or query using an invalid source pool', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                ZERO_ADDRESS,
                                targetToken.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(ZERO_ADDRESS, targetToken.address, 1, targetAmount)
                            ).to.be.revertedWith('DoesNotExist');
                        }
                    });

                    it('should revert when attempting to trade or query using an invalid target pool', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                ZERO_ADDRESS,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(sourceToken.address, ZERO_ADDRESS, 1, targetAmount)
                            ).to.be.revertedWith('DoesNotExist');
                        }
                    });

                    it('should revert when attempting to trade or query using a non-existing source pool', async () => {
                        const reserveToken2 = await createTestToken();

                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                reserveToken2.address,
                                networkToken.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(
                                    reserveToken2.address,
                                    networkToken.address,
                                    1,
                                    targetAmount
                                )
                            ).to.be.revertedWith('DoesNotExist');
                        }
                    });

                    it('should revert when attempting to trade or query using a non-existing target pool', async () => {
                        const reserveToken2 = await createTestToken();

                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                networkToken.address,
                                reserveToken2.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(
                                    networkToken.address,
                                    reserveToken2.address,
                                    1,
                                    targetAmount
                                )
                            ).to.be.revertedWith('DoesNotExist');
                        }
                    });

                    it('should revert when attempting to trade or query without using the network token as one of the pools', async () => {
                        const reserveToken2 = await createTestToken();

                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                reserveToken.address,
                                reserveToken2.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(
                                    reserveToken.address,
                                    reserveToken2.address,
                                    1,
                                    targetAmount
                                )
                            ).to.be.revertedWith('DoesNotExist');
                        }
                    });

                    it('should revert when attempting to trade or query using the network token as both of the pools', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                networkToken.address,
                                networkToken.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(
                                    networkToken.address,
                                    networkToken.address,
                                    1,
                                    targetAmount
                                )
                            ).to.be.revertedWith('DoesNotExist');
                        }
                    });

                    it('should revert when attempting to trade or query with an invalid amount', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                0,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('ZeroValue');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(
                                    sourceToken.address,
                                    targetToken.address,
                                    0,
                                    targetAmount
                                )
                            ).to.be.revertedWith('ZeroValue');
                        }
                    });

                    it('should revert when attempting to trade with an invalid minimum return amount', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                1,
                                0
                            )
                        ).to.be.revertedWith('ZeroValue');
                    });

                    context('with sufficient network token liquidity', () => {
                        beforeEach(async () => {
                            await setTradingLiquidity(MIN_LIQUIDITY_FOR_TRADING, 0);
                        });

                        context('with sufficient target and source pool balances', () => {
                            beforeEach(async () => {
                                const networkTokenTradingLiquidity = MIN_LIQUIDITY_FOR_TRADING.mul(1000);

                                // for the tests below, ensure that the source to target ratio above 1, such that a zero
                                // trading result is possible
                                const baseTokenTradingLiquidity = isSourceNetworkToken
                                    ? networkTokenTradingLiquidity.div(2)
                                    : networkTokenTradingLiquidity.mul(2);

                                await setTradingLiquidity(networkTokenTradingLiquidity, baseTokenTradingLiquidity);
                            });

                            it('should revert when the trade result is zero', async () => {
                                await expect(
                                    network.tradePoolCollectionT(
                                        poolCollection.address,
                                        CONTEXT_ID,
                                        sourceToken.address,
                                        targetToken.address,
                                        1,
                                        MIN_RETURN_AMOUNT
                                    )
                                ).to.be.revertedWith('ZeroTargetAmount');
                            });

                            it('should revert when the trade result is below the minimum return amount', async () => {
                                await expect(
                                    network.tradePoolCollectionT(
                                        poolCollection.address,
                                        CONTEXT_ID,
                                        sourceToken.address,
                                        targetToken.address,
                                        toWei(12_345),
                                        MAX_UINT256
                                    )
                                ).to.be.revertedWith('ReturnAmountTooLow');
                            });
                        });
                    });

                    context('when network token liquidity falls below the minimum liquidity for trading', () => {
                        beforeEach(async () => {
                            // increase the network token liquidity by the growth factor a few times
                            for (let i = 0; i < 5; i++) {
                                await depositToPool(deployer, reserveToken, 1000, network);
                            }

                            const { liquidity: prevLiquidity } = await poolCollection.poolData(reserveToken.address);

                            const targetNetworkTokenLiquidity = MIN_LIQUIDITY_FOR_TRADING.div(4);
                            const networkTokenTradeAmountToTrade =
                                prevLiquidity.networkTokenTradingLiquidity.sub(targetNetworkTokenLiquidity);

                            // trade enough network tokens out such that the total network token liquidity for trading
                            // falls bellow the minimum liquidity for trading
                            const { amount } = await poolCollection.tradeAmountAndFee(
                                reserveToken.address,
                                networkToken.address,
                                networkTokenTradeAmountToTrade,
                                false
                            );

                            // we will use the "full trade" function since we must to ensure that the tokens will also
                            // leave the master vault
                            await reserveToken.connect(deployer).approve(network.address, amount);
                            await network.trade(
                                reserveToken.address,
                                networkToken.address,
                                amount,
                                MIN_RETURN_AMOUNT,
                                MAX_UINT256,
                                deployer.address
                            );

                            const { liquidity } = await poolCollection.poolData(reserveToken.address);

                            expect(liquidity.networkTokenTradingLiquidity).lt(MIN_LIQUIDITY_FOR_TRADING);

                            // ensure that enough time passed for the pool to be considered as stable again
                            await poolCollection.setTime(
                                (await poolCollection.currentTime()) + AVERAGE_RATE_PERIOD + duration.days(1)
                            );
                        });

                        it('should allow trading', async () => {
                            const res = await network.tradePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                toWei(1),
                                MIN_RETURN_AMOUNT
                            );

                            await expect(res).to.emit(poolCollection, 'TradingLiquidityUpdated');
                        });

                        it('should disable trading when withdrawing', async () => {
                            const { liquidity: prevLiquidity } = await poolCollection.poolData(reserveToken.address);
                            const prevFunding = await masterPool.currentPoolFunding(reserveToken.address);
                            const poolToken = await Contracts.PoolToken.attach(
                                await poolCollection.poolToken(reserveToken.address)
                            );
                            const poolTokenTotalSupply = await poolToken.totalSupply();

                            const poolTokenAmount = toWei(10);
                            const newStakedBalance = prevLiquidity.stakedBalance
                                .mul(poolTokenTotalSupply.sub(poolTokenAmount))
                                .div(poolTokenTotalSupply);

                            await poolToken.connect(deployer).transfer(network.address, poolTokenAmount);
                            await network.approveT(poolToken.address, poolCollection.address, poolTokenAmount);

                            const withdrawalAmounts = await poolCollection.poolWithdrawalAmountsT(
                                reserveToken.address,
                                poolTokenAmount
                            );

                            const res = await network.withdrawFromPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                deployer.address,
                                reserveToken.address,
                                poolTokenAmount
                            );

                            await testLiquidityReset(
                                reserveToken,
                                poolCollection,
                                masterPool,
                                true,
                                res,
                                newStakedBalance,
                                prevFunding.sub(
                                    withdrawalAmounts.newNetworkTokenTradingLiquidity.add(
                                        withdrawalAmounts.networkTokensProtocolHoldingsDelta.value
                                    )
                                ),
                                TradingStatusUpdateReason.MinLiquidity
                            );
                        });

                        it('should disable trading when depositing', async () => {
                            const { liquidity: prevLiquidity } = await poolCollection.poolData(reserveToken.address);
                            const prevFunding = await masterPool.currentPoolFunding(reserveToken.address);

                            const amount = 1;
                            const res = await network.depositToPoolCollectionForT(
                                poolCollection.address,
                                CONTEXT_ID,
                                deployer.address,
                                reserveToken.address,
                                amount
                            );

                            await testLiquidityReset(
                                reserveToken,
                                poolCollection,
                                masterPool,
                                true,
                                res,
                                prevLiquidity.stakedBalance.add(amount),
                                prevFunding.sub(prevLiquidity.networkTokenTradingLiquidity),
                                TradingStatusUpdateReason.MinLiquidity
                            );
                        });
                    });

                    context('with insufficient pool balances', () => {
                        beforeEach(async () => {
                            await networkSettings.setMinLiquidityForTrading(0);
                        });

                        context('source pool', () => {
                            const amount = BigNumber.from(12_345);

                            context('empty', () => {
                                beforeEach(async () => {
                                    const targetBalance = amount.mul(999_999_999_999);
                                    const networkTokenTradingLiquidity = isSourceNetworkToken
                                        ? BigNumber.from(0)
                                        : targetBalance;
                                    const baseTokenTradingLiquidity = isSourceNetworkToken
                                        ? targetBalance
                                        : BigNumber.from(0);
                                    await setTradingLiquidity(networkTokenTradingLiquidity, baseTokenTradingLiquidity);
                                });

                                it('should revert when attempting to trade or query', async () => {
                                    await expect(
                                        network.tradePoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MIN_RETURN_AMOUNT
                                        )
                                    ).to.be.revertedWith('InsufficientLiquidity');

                                    for (const targetAmount of [true, false]) {
                                        await expect(
                                            poolCollection.tradeAmountAndFee(
                                                sourceToken.address,
                                                targetToken.address,
                                                amount,
                                                targetAmount
                                            )
                                        ).to.be.revertedWith('InsufficientLiquidity');
                                    }
                                });
                            });
                        });

                        context('target pool', () => {
                            context('empty', () => {
                                const amount = 12_345;

                                beforeEach(async () => {
                                    const sourceBalance = BigNumber.from(12_345);
                                    const networkTokenTradingLiquidity = isSourceNetworkToken
                                        ? sourceBalance
                                        : BigNumber.from(0);

                                    const baseTokenTradingLiquidity = isSourceNetworkToken
                                        ? BigNumber.from(0)
                                        : sourceBalance;

                                    await setTradingLiquidity(networkTokenTradingLiquidity, baseTokenTradingLiquidity);
                                });

                                it('should revert when attempting to trade or query', async () => {
                                    await expect(
                                        network.tradePoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MIN_RETURN_AMOUNT
                                        )
                                    ).to.be.revertedWith('InsufficientLiquidity');

                                    for (const targetAmount of [true, false]) {
                                        await expect(
                                            poolCollection.tradeAmountAndFee(
                                                sourceToken.address,
                                                targetToken.address,
                                                amount,
                                                targetAmount
                                            )
                                        ).to.be.revertedWith(
                                            targetAmount
                                                ? 'InsufficientLiquidity'
                                                : 'reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)' // eslint-disable-line max-len
                                        );
                                    }
                                });
                            });

                            context('insufficient', () => {
                                const networkTokenTradingLiquidity = BigNumber.from(12_345);
                                const baseTokenTradingLiquidity = BigNumber.from(9_999_999);

                                const targetBalance = isSourceNetworkToken
                                    ? baseTokenTradingLiquidity
                                    : networkTokenTradingLiquidity;

                                let targetAmount: BigNumber;

                                beforeEach(async () => {
                                    await setTradingLiquidity(networkTokenTradingLiquidity, baseTokenTradingLiquidity);

                                    targetAmount = targetBalance;
                                });

                                it('should revert when attempting to query the source amount', async () => {
                                    await expect(
                                        poolCollection.tradeAmountAndFee(
                                            sourceToken.address,
                                            targetToken.address,
                                            targetAmount,
                                            false
                                        )
                                    ).to.be.revertedWith(
                                        'reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)'
                                    );
                                });

                                context('with a trading fee', () => {
                                    beforeEach(async () => {
                                        const tradingFeePPM = toPPM(10);
                                        await poolCollection.setTradingFeePPM(reserveToken.address, tradingFeePPM);

                                        // derive a target amount such that adding a fee to it will result in an amount
                                        // equal to the target balance, by solving the following two equations:
                                        // 1. `feeAmount = targetAmount * tradingFee / (1 - tradingFee)`
                                        // 2. `targetAmount + feeAmount = targetBalance`
                                        targetAmount = targetBalance
                                            .mul(PPM_RESOLUTION - tradingFeePPM)
                                            .div(PPM_RESOLUTION);
                                        // Note that due to the integer-division, we expect:
                                        // - `targetAmount + feeAmount` to be slightly smaller than `targetBalance`
                                        // - `targetAmount + feeAmount + 1` to be equal to or larger than `targetBalance`
                                    });

                                    it('should not revert when attempting to query the source amount', async () => {
                                        await poolCollection.tradeAmountAndFee(
                                            sourceToken.address,
                                            targetToken.address,
                                            targetAmount,
                                            false
                                        );
                                    });

                                    it('should revert when attempting to query the source amount', async () => {
                                        await expect(
                                            poolCollection.tradeAmountAndFee(
                                                sourceToken.address,
                                                targetToken.address,
                                                targetAmount.add(1),
                                                false
                                            )
                                        ).to.be.revertedWith('reverted with panic code'); // either division by zero or subtraction underflow
                                    });
                                });
                            });
                        });
                    });

                    interface Spec {
                        sourceBalance: BigNumber;
                        targetBalance: BigNumber;
                        tradingFeePPM: number;
                        amount: BigNumber;
                        intervals: number[];
                    }

                    const testTrading = (spec: Spec) => {
                        const { sourceBalance, targetBalance, tradingFeePPM, amount, intervals } = spec;

                        context(
                            `with (${[sourceBalance, targetBalance, tradingFeePPM, amount]}) [${intervals}]`,
                            () => {
                                type PoolData = AsyncReturnType<TestPoolCollection['poolData']>;
                                const expectedAverageRate = async (poolData: PoolData, timeElapsed: number) => {
                                    const { liquidity } = poolData;

                                    return poolAverageRate.calcAverageRate(
                                        {
                                            n: liquidity.networkTokenTradingLiquidity,
                                            d: liquidity.baseTokenTradingLiquidity
                                        },
                                        poolData.averageRate,
                                        timeElapsed
                                    );
                                };

                                const expectedTargetAmountAndFee = (sourceAmount: BigNumber, poolData: PoolData) => {
                                    const { liquidity } = poolData;

                                    const sourceTokenBalance = isSourceNetworkToken
                                        ? liquidity.networkTokenTradingLiquidity
                                        : liquidity.baseTokenTradingLiquidity;
                                    const targetTokenBalance = isSourceNetworkToken
                                        ? liquidity.baseTokenTradingLiquidity
                                        : liquidity.networkTokenTradingLiquidity;

                                    const amount = new Decimal(targetTokenBalance.toString())
                                        .mul(sourceAmount.toString())
                                        .div(sourceTokenBalance.add(sourceAmount).toString());
                                    const feeAmount = new Decimal(amount.toString())
                                        .mul(poolData.tradingFeePPM)
                                        .div(PPM_RESOLUTION);

                                    return { amount: amount.sub(feeAmount), feeAmount };
                                };

                                let poolAverageRate: TestPoolAverageRate;

                                beforeEach(async () => {
                                    poolAverageRate = await Contracts.TestPoolAverageRate.deploy();

                                    const networkTokenTradingLiquidity = isSourceNetworkToken
                                        ? sourceBalance
                                        : targetBalance;
                                    const baseTokenTradingLiquidity = isSourceNetworkToken
                                        ? targetBalance
                                        : sourceBalance;
                                    await setTradingLiquidity(networkTokenTradingLiquidity, baseTokenTradingLiquidity);

                                    await poolCollection.setAverageRateT(reserveToken.address, {
                                        time: 0,
                                        rate: { n: networkTokenTradingLiquidity, d: baseTokenTradingLiquidity }
                                    });

                                    await poolCollection.setTradingFeePPM(reserveToken.address, tradingFeePPM);
                                });

                                it('should perform a trade', async () => {
                                    for (const interval of intervals) {
                                        await poolCollection.setTime(interval);

                                        const prevPoolData = await poolCollection.poolData(reserveToken.address);
                                        const { liquidity: prevLiquidity } = prevPoolData;

                                        const targetAmountAndFee = await poolCollection.tradeAmountAndFee(
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            true
                                        );

                                        const sourceAmountAndFee = await poolCollection.tradeAmountAndFee(
                                            sourceToken.address,
                                            targetToken.address,
                                            targetAmountAndFee.amount,
                                            false
                                        );

                                        const tradeAmountsWithLiquidity = await network.callStatic.tradePoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MIN_RETURN_AMOUNT
                                        );

                                        const res = await network.tradePoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MIN_RETURN_AMOUNT
                                        );

                                        const expectedTargetAmounts = expectedTargetAmountAndFee(amount, prevPoolData);
                                        expect(targetAmountAndFee.amount).to.almostEqual(expectedTargetAmounts.amount, {
                                            maxRelativeError: new Decimal('0.0000000000000000001')
                                        });
                                        expect(targetAmountAndFee.feeAmount).to.almostEqual(
                                            expectedTargetAmounts.feeAmount,
                                            {
                                                maxRelativeError: new Decimal('0.000000000000000006'),
                                                relation: Relation.LesserOrEqual
                                            }
                                        );

                                        expect(sourceAmountAndFee.amount).to.almostEqual(amount, {
                                            maxRelativeError: new Decimal('0.0000000000000000001')
                                        });
                                        expect(sourceAmountAndFee.feeAmount).to.almostEqual(
                                            targetAmountAndFee.feeAmount,
                                            {
                                                maxRelativeError: new Decimal('0.000000000000000002'),
                                                relation: Relation.GreaterOrEqual
                                            }
                                        );

                                        const poolData = await poolCollection.poolData(reserveToken.address);
                                        const { liquidity } = poolData;

                                        await expect(res)
                                            .to.emit(poolCollection, 'TradingLiquidityUpdated')
                                            .withArgs(
                                                CONTEXT_ID,
                                                reserveToken.address,
                                                networkToken.address,
                                                liquidity.networkTokenTradingLiquidity
                                            );

                                        await expect(res)
                                            .to.emit(poolCollection, 'TradingLiquidityUpdated')
                                            .withArgs(
                                                CONTEXT_ID,
                                                reserveToken.address,
                                                reserveToken.address,
                                                liquidity.baseTokenTradingLiquidity
                                            );

                                        await expect(res).not.to.emit(poolCollection, 'TotalLiquidityUpdated');

                                        expect(tradeAmountsWithLiquidity.amount).to.equal(targetAmountAndFee.amount);
                                        expect(tradeAmountsWithLiquidity.feeAmount).to.equal(
                                            targetAmountAndFee.feeAmount
                                        );
                                        expect(
                                            tradeAmountsWithLiquidity.liquidity.networkTokenTradingLiquidity
                                        ).to.equal(liquidity.networkTokenTradingLiquidity);
                                        expect(tradeAmountsWithLiquidity.liquidity.baseTokenTradingLiquidity).to.equal(
                                            liquidity.baseTokenTradingLiquidity
                                        );
                                        expect(tradeAmountsWithLiquidity.liquidity.stakedBalance).to.equal(
                                            liquidity.stakedBalance
                                        );

                                        if (isSourceNetworkToken) {
                                            expect(liquidity.networkTokenTradingLiquidity).to.equal(
                                                prevLiquidity.networkTokenTradingLiquidity.add(amount)
                                            );
                                            expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                                prevLiquidity.baseTokenTradingLiquidity.sub(
                                                    tradeAmountsWithLiquidity.amount
                                                )
                                            );
                                            expect(liquidity.stakedBalance).to.equal(
                                                prevLiquidity.stakedBalance.add(tradeAmountsWithLiquidity.feeAmount)
                                            );
                                        } else {
                                            expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                                prevLiquidity.baseTokenTradingLiquidity.add(amount)
                                            );
                                            expect(liquidity.networkTokenTradingLiquidity).to.equal(
                                                prevLiquidity.networkTokenTradingLiquidity.sub(
                                                    tradeAmountsWithLiquidity.amount
                                                )
                                            );
                                        }

                                        // verify that the average rate has been updated
                                        const expectedNewAverageRate = await expectedAverageRate(
                                            prevPoolData,
                                            interval
                                        );
                                        expect(poolData.averageRate.time).to.equal(expectedNewAverageRate.time);
                                        expect(poolData.averageRate.rate).to.equal(expectedNewAverageRate.rate);
                                    }
                                });
                            }
                        );
                    };

                    describe('regular tests', () => {
                        for (const sourceBalance of [1_000_000, 5_000_000]) {
                            for (const targetBalance of [1_000_000, 5_000_000]) {
                                for (const tradingFeePercent of [0, 10]) {
                                    for (const amount of [1_000]) {
                                        testTrading({
                                            sourceBalance: toWei(sourceBalance),
                                            targetBalance: toWei(targetBalance),
                                            tradingFeePPM: toPPM(tradingFeePercent),
                                            amount: toWei(amount),
                                            intervals: [0, 200, 500]
                                        });
                                    }
                                }
                            }
                        }
                    });

                    describe('@stress tests', () => {
                        for (const sourceBalance of [1_000_000, 5_000_000, 100_000_000]) {
                            for (const targetBalance of [1_000_000, 5_000_000, 100_000_000]) {
                                for (const tradingFeePercent of [0, 1, 10]) {
                                    for (const amount of [1_000, 10_000, 100_000]) {
                                        testTrading({
                                            sourceBalance: toWei(sourceBalance),
                                            targetBalance: toWei(targetBalance),
                                            tradingFeePPM: toPPM(tradingFeePercent),
                                            amount: toWei(amount),
                                            intervals: [0, 1, 2, 10, 100, 200, 400, 500]
                                        });
                                    }
                                }
                            }
                        }
                    });
                });
            });
        };

        for (const isSourceNetworkToken of [true, false]) {
            testTrading(isSourceNetworkToken);
        }
    });

    describe('fee collection', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, poolCollection } = await createSystem());

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);
        });

        it('should revert when attempting to notify about collected fee from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                poolCollection.connect(nonNetwork).onFeesCollected(reserveToken.address, 1)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when attempting to notify about collected fee from an invalid pool', async () => {
            await expect(
                network.onPoolCollectionFeesCollectedT(poolCollection.address, ZERO_ADDRESS, 1)
            ).to.be.revertedWith('DoesNotExist');
        });

        it('should revert when attempting to notify about collected fee from a non-existing pool', async () => {
            const reserveToken2 = await createTestToken();

            await expect(
                network.onPoolCollectionFeesCollectedT(poolCollection.address, reserveToken2.address, 1)
            ).to.be.revertedWith('DoesNotExist');
        });

        for (const feeAmount of [0, 12_345, toWei(12_345)]) {
            it(`should collect fees of ${feeAmount.toString()}`, async () => {
                const prevPoolLiquidity = await poolCollection.poolLiquidity(reserveToken.address);

                await network.onPoolCollectionFeesCollectedT(poolCollection.address, reserveToken.address, feeAmount);

                const poolLiquidity = await poolCollection.poolLiquidity(reserveToken.address);

                expect(poolLiquidity.stakedBalance).to.equal(prevPoolLiquidity.stakedBalance.add(feeAmount));
            });
        }
    });

    describe('pool token calculations', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;
        let poolToken: PoolToken;
        let externalRewardsVault: ExternalRewardsVault;

        const BASE_TOKEN_LIQUIDITY = toWei(1_000_000_000);

        beforeEach(async () => {
            ({ networkSettings, network, poolCollection, externalRewardsVault } = await createSystem());

            await externalRewardsVault.grantRole(Roles.Vault.ROLE_ASSET_MANAGER, deployer.address);

            reserveToken = await createTestToken();

            poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);

            await network.depositToPoolCollectionForT(
                poolCollection.address,
                CONTEXT_ID,
                deployer.address,
                reserveToken.address,
                BASE_TOKEN_LIQUIDITY
            );
        });

        for (const tokenAmount of [0, 1000, toWei(20_000), toWei(3_000_000)]) {
            context(`underlying amount of ${tokenAmount.toString()}`, () => {
                it('should properly convert between underlying amount and pool token amount', async () => {
                    const poolTokenTotalSupply = await poolToken.totalSupply();
                    const { stakedBalance } = await poolCollection.poolLiquidity(reserveToken.address);

                    const poolTokenAmount = await poolCollection.underlyingToPoolToken(
                        reserveToken.address,
                        tokenAmount
                    );
                    expect(poolTokenAmount).to.equal(
                        BigNumber.from(tokenAmount).mul(poolTokenTotalSupply).div(stakedBalance)
                    );

                    const underlyingAmount = await poolCollection.poolTokenToUnderlying(
                        reserveToken.address,
                        poolTokenAmount
                    );
                    expect(underlyingAmount).to.be.closeTo(BigNumber.from(tokenAmount), 1);
                });

                for (const protocolPoolTokenAmount of [0, 100_000, toWei(50_000)]) {
                    context(`protocol pool token amount of ${protocolPoolTokenAmount} `, () => {
                        beforeEach(async () => {
                            if (protocolPoolTokenAmount !== 0) {
                                await poolCollection.mintPoolTokenT(
                                    reserveToken.address,
                                    externalRewardsVault.address,
                                    protocolPoolTokenAmount
                                );
                            }
                        });

                        it('should properly calculate pool token amount to burn in order to increase underlying value', async () => {
                            const poolTokenAmount = await poolToken.balanceOf(deployer.address);
                            const prevUnderlying = await poolCollection.poolTokenToUnderlying(
                                reserveToken.address,
                                poolTokenAmount
                            );

                            const poolTokenAmountToBurn = await poolCollection.poolTokenAmountToBurn(
                                reserveToken.address,
                                tokenAmount,
                                protocolPoolTokenAmount
                            );

                            // ensure that burning the resulted pool token amount increases the underlying by the
                            // specified network amount while taking into account pool tokens owned by the protocol
                            // (note that, for this test, it doesn't matter where from the pool tokens are being burned)
                            await poolToken.connect(deployer).burn(poolTokenAmountToBurn);

                            expect(
                                await poolCollection.poolTokenToUnderlying(reserveToken.address, poolTokenAmount)
                            ).to.be.closeTo(prevUnderlying.add(tokenAmount), 1);
                        });
                    });
                }
            });
        }
    });

    describe('pool migrations', () => {
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let networkSettings: NetworkSettings;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let masterPool: TestMasterPool;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolToken: PoolToken;
        let targetPoolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({
                network,
                networkToken,
                networkSettings,
                masterVault,
                externalProtectionVault,
                masterPool,
                poolTokenFactory,
                poolCollection,
                poolCollectionUpgrader
            } = await createSystem());

            reserveToken = await createTestToken();

            poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);

            targetPoolCollection = await createPoolCollection(
                network,
                networkToken,
                networkSettings,
                masterVault,
                masterPool,
                externalProtectionVault,
                poolTokenFactory,
                poolCollectionUpgrader,
                (await poolCollection.version()) + 1
            );
            await network.addPoolCollection(targetPoolCollection.address);
            await network.setLatestPoolCollection(targetPoolCollection.address);
        });

        describe('in', () => {
            it('should revert when attempting to migrate a pool into a pool collection from a non-upgrader', async () => {
                const nonUpgrader = deployer;

                const poolData = await poolCollection.poolData(reserveToken.address);
                await expect(
                    targetPoolCollection.connect(nonUpgrader).migratePoolIn(reserveToken.address, poolData)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to migrate an invalid pool into a pool collection', async () => {
                const poolData = await poolCollection.poolData(reserveToken.address);
                await expect(
                    poolCollectionUpgrader.migratePoolInT(targetPoolCollection.address, ZERO_ADDRESS, poolData)
                ).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to migrate an already existing pool into a pool collection', async () => {
                const poolData = await poolCollection.poolData(reserveToken.address);
                await expect(
                    poolCollectionUpgrader.migratePoolInT(poolCollection.address, reserveToken.address, poolData)
                ).to.be.revertedWith('AlreadyExists');
            });

            it('should revert when attempting to migrate a pool that was not migrated out', async () => {
                const poolData = await poolCollection.poolData(reserveToken.address);

                await expect(
                    poolCollectionUpgrader.migratePoolInT(targetPoolCollection.address, reserveToken.address, poolData)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should allow to migrate a pool into a pool collection', async () => {
                let newPoolData = await targetPoolCollection.poolData(reserveToken.address);
                expect(newPoolData.poolToken).to.equal(ZERO_ADDRESS);

                expect(await poolToken.owner()).to.equal(poolCollection.address);

                const poolData = await poolCollection.poolData(reserveToken.address);

                await poolCollectionUpgrader.migratePoolOutT(
                    poolCollection.address,
                    reserveToken.address,
                    targetPoolCollection.address
                );

                const res = await poolCollectionUpgrader.migratePoolInT(
                    targetPoolCollection.address,
                    reserveToken.address,
                    poolData
                );

                await expect(res).to.emit(targetPoolCollection, 'PoolMigratedIn').withArgs(reserveToken.address);

                newPoolData = await targetPoolCollection.poolData(reserveToken.address);
                expect(newPoolData).to.deep.equal(poolData);

                expect(await poolToken.owner()).to.equal(targetPoolCollection.address);
            });
        });

        describe('out', () => {
            it('should revert when attempting to migrate a pool out of a pool collection from a non-upgrader', async () => {
                const nonUpgrader = deployer;

                await expect(
                    poolCollection
                        .connect(nonUpgrader)
                        .migratePoolOut(reserveToken.address, targetPoolCollection.address)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to migrate an invalid pool out of a pool collection', async () => {
                await expect(
                    poolCollectionUpgrader.migratePoolOutT(
                        poolCollection.address,
                        ZERO_ADDRESS,
                        targetPoolCollection.address
                    )
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when attempting to migrate a pool out of a pool collection to an invalid pool collection', async () => {
                await expect(
                    poolCollectionUpgrader.migratePoolOutT(poolCollection.address, reserveToken.address, ZERO_ADDRESS)
                ).to.be.revertedWith('InvalidAddress');

                const newPoolCollection = await createPoolCollection(
                    network,
                    networkToken,
                    networkSettings,
                    masterVault,
                    masterPool,
                    externalProtectionVault,
                    poolTokenFactory,
                    poolCollectionUpgrader
                );
                await expect(
                    poolCollectionUpgrader.migratePoolOutT(
                        poolCollection.address,
                        reserveToken.address,
                        newPoolCollection.address
                    )
                ).to.be.revertedWith('InvalidPoolCollection');
            });

            it('should revert when attempting to migrate a non-existing pool out of a pool collection', async () => {
                const reserveToken2 = await createTestToken();
                await expect(
                    poolCollectionUpgrader.migratePoolOutT(
                        poolCollection.address,
                        reserveToken2.address,
                        targetPoolCollection.address
                    )
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should allow to migrate a pool out of a pool collection', async () => {
                let poolData = await poolCollection.poolData(reserveToken.address);
                expect(poolData.poolToken).not.to.equal(ZERO_ADDRESS);

                expect(await poolToken.owner()).to.equal(poolCollection.address);

                const res = await poolCollectionUpgrader.migratePoolOutT(
                    poolCollection.address,
                    reserveToken.address,
                    targetPoolCollection.address
                );

                await expect(res).to.emit(poolCollection, 'PoolMigratedOut').withArgs(reserveToken.address);

                poolData = await poolCollection.poolData(reserveToken.address);
                expect(poolData.poolToken).to.equal(ZERO_ADDRESS);

                expect(await poolToken.newOwner()).to.equal(targetPoolCollection.address);
            });
        });
    });
});
