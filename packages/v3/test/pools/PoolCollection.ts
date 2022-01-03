import { AsyncReturnType } from '../../components/ContractBuilder';
import Contracts from '../../components/Contracts';
import {
    TestStakingRewardsMath,
    IERC20,
    ExternalRewardsVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestERC20Token,
    TestPoolAverageRate,
    TestPoolCollection,
    TestPoolCollectionUpgrader
} from '../../typechain-types';
import { DepositAmountsStructOutput } from '../../typechain-types/TestPoolCollection';
import { roles } from '../helpers/AccessControl';
import {
    INVALID_FRACTION,
    MAX_UINT256,
    PPM_RESOLUTION,
    ZERO_ADDRESS,
    ZERO_FRACTION,
    ETH,
    TKN
} from '../helpers/Constants';
import { createPool, createPoolCollection, createSystem } from '../helpers/Factory';
import { toWei, toPPM } from '../helpers/Types';
import { createTokenBySymbol, TokenWithAddress } from '../helpers/Utils';
import { Relation } from '../matchers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

describe('PoolCollection', () => {
    const DEFAULT_TRADING_FEE_PPM = toPPM(0.2);
    const POOL_TYPE = 1;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(1000);
    const INITIAL_RATE = { n: 1, d: 2 };

    const TRADING_STATUS_UPDATE_OWNER = 0;
    const TRADING_STATUS_UPDATE_MIN_LIQUIDITY = 1;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let networkSettings: NetworkSettings;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolCollectionUpgrader: TestPoolCollectionUpgrader;

        beforeEach(async () => {
            ({ network, networkToken, networkSettings, poolTokenFactory, poolCollection, poolCollectionUpgrader } =
                await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    ZERO_ADDRESS,
                    networkToken.address,
                    networkSettings.address,
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

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);
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

        const testCreatePool = (symbol: string) => {
            beforeEach(async () => {
                ({ network, networkSettings, poolCollection } = await createSystem());

                reserveToken = await createTokenBySymbol(symbol);
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
                        .withArgs(reserveToken.address, false, TRADING_STATUS_UPDATE_OWNER);
                    await expect(res)
                        .to.emit(poolCollection, 'DepositingEnabled')
                        .withArgs(reserveToken.address, pool.depositingEnabled);
                    await expect(res)
                        .to.emit(poolCollection, 'InitialRateUpdated')
                        .withArgs(reserveToken.address, INVALID_FRACTION, pool.initialRate);
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
                    expect(pool.tradingEnabled).to.be.true;
                    expect(pool.depositingEnabled).to.be.true;
                    expect(pool.averageRate.time).to.equal(0);
                    expect(pool.averageRate.rate).to.equal(ZERO_FRACTION);
                    expect(pool.initialRate).to.equal(ZERO_FRACTION);
                    expect(pool.depositLimit).to.equal(0);

                    const { liquidity } = pool;
                    expect(liquidity.baseTokenTradingLiquidity).to.equal(0);
                    expect(liquidity.networkTokenTradingLiquidity).to.equal(0);
                    expect(liquidity.tradingLiquidityProduct).to.equal(0);
                    expect(liquidity.stakedBalance).to.equal(0);

                    const poolLiquidity = await poolCollection.poolLiquidity(reserveToken.address);
                    expect(poolLiquidity.baseTokenTradingLiquidity).to.equal(liquidity.baseTokenTradingLiquidity);
                    expect(poolLiquidity.networkTokenTradingLiquidity).to.equal(liquidity.networkTokenTradingLiquidity);
                    expect(poolLiquidity.tradingLiquidityProduct).to.equal(liquidity.tradingLiquidityProduct);
                    expect(poolLiquidity.stakedBalance).to.equal(liquidity.stakedBalance);
                });
            });
        };

        for (const symbol of [ETH, TKN]) {
            context(symbol, () => {
                testCreatePool(symbol);
            });
        }
    });

    describe('pool settings', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let poolCollection: TestPoolCollection;
        let newReserveToken: TestERC20Token;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, poolCollection } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

            await createPool(reserveToken, network, networkSettings, poolCollection);

            newReserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);
        });

        describe('initial rate', () => {
            const newInitialRate = { n: 1000, d: 5000 };

            it('should revert when a non-owner attempts to set the initial rate', async () => {
                await expect(
                    poolCollection.connect(nonOwner).setInitialRate(reserveToken.address, newInitialRate)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when setting an invalid rate', async () => {
                await expect(
                    poolCollection.setInitialRate(reserveToken.address, {
                        n: 1000,
                        d: 0
                    })
                ).to.be.revertedWith('InvalidRate');

                await expect(
                    poolCollection.setInitialRate(reserveToken.address, {
                        n: 0,
                        d: 1000
                    })
                ).to.be.revertedWith('InvalidRate');
            });

            it('should revert when setting the initial rate of a non-existing pool', async () => {
                await expect(poolCollection.setInitialRate(newReserveToken.address, newInitialRate)).to.be.revertedWith(
                    'DoesNotExist'
                );
            });

            it('should ignore updating to the same initial rate', async () => {
                await poolCollection.setInitialRate(reserveToken.address, newInitialRate);

                const res = await poolCollection.setInitialRate(reserveToken.address, newInitialRate);
                await expect(res).not.to.emit(poolCollection, 'InitialRateUpdated');
            });

            it('should allow setting and updating the initial rate', async () => {
                let pool = await poolCollection.poolData(reserveToken.address);
                let { initialRate } = pool;
                expect(initialRate).to.equal(ZERO_FRACTION);

                const res = await poolCollection.setInitialRate(reserveToken.address, newInitialRate);
                await expect(res)
                    .to.emit(poolCollection, 'InitialRateUpdated')
                    .withArgs(reserveToken.address, initialRate, newInitialRate);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ initialRate } = pool);
                expect(initialRate).to.equal(newInitialRate);

                const newInitialRate2 = { n: 100_000, d: 50 };
                const res2 = await poolCollection.setInitialRate(reserveToken.address, newInitialRate2);
                await expect(res2)
                    .to.emit(poolCollection, 'InitialRateUpdated')
                    .withArgs(reserveToken.address, initialRate, newInitialRate2);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ initialRate } = pool);
                expect(initialRate).to.equal(newInitialRate2);
            });
        });

        describe('trading fee', () => {
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

        describe('enable trading', () => {
            it('should revert when a non-owner attempts to enable trading', async () => {
                await expect(
                    poolCollection.connect(nonOwner).enableTrading(reserveToken.address, true)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when enabling trading for a non-existing pool', async () => {
                await expect(poolCollection.enableTrading(newReserveToken.address, true)).to.be.revertedWith(
                    'DoesNotExist'
                );
            });

            it('should ignore updating to the same status', async () => {
                await poolCollection.enableTrading(reserveToken.address, false);

                const res = await poolCollection.enableTrading(reserveToken.address, false);
                await expect(res).not.to.emit(poolCollection, 'TradingEnabled');
            });

            it('should allow enabling and disabling trading', async () => {
                let pool = await poolCollection.poolData(reserveToken.address);
                let { tradingEnabled } = pool;
                expect(tradingEnabled).to.be.true;

                const res = await poolCollection.enableTrading(reserveToken.address, false);
                await expect(res)
                    .to.emit(poolCollection, 'TradingEnabled')
                    .withArgs(reserveToken.address, false, TRADING_STATUS_UPDATE_OWNER);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ tradingEnabled } = pool);
                expect(tradingEnabled).to.be.false;

                const res2 = await poolCollection.enableTrading(reserveToken.address, true);
                await expect(res2)
                    .to.emit(poolCollection, 'TradingEnabled')
                    .withArgs(reserveToken.address, true, TRADING_STATUS_UPDATE_OWNER);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ tradingEnabled } = pool);
                expect(tradingEnabled).to.be.true;
            });
        });

        describe('enable depositing', () => {
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

        describe('deposit limit', () => {
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

    describe('deposit', () => {
        const testDeposit = (symbol: string) => {
            let networkSettings: NetworkSettings;
            let network: TestBancorNetwork;
            let poolCollection: TestPoolCollection;
            let reserveToken: TokenWithAddress;

            let provider: SignerWithAddress;

            before(async () => {
                [deployer, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ network, networkSettings, poolCollection } = await createSystem());

                reserveToken = await createTokenBySymbol(symbol);
            });

            it('should revert when attempting to deposit from a non-network', async () => {
                const nonNetwork = deployer;

                await expect(
                    poolCollection.connect(nonNetwork).depositFor(provider.address, reserveToken.address, 1, 2)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to deposit for an invalid provider', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        ZERO_ADDRESS,
                        reserveToken.address,
                        1,
                        2
                    )
                ).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to deposit for an invalid pool', async () => {
                await expect(
                    network.depositToPoolCollectionForT(poolCollection.address, provider.address, ZERO_ADDRESS, 1, 2)
                ).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to deposit into a pool that does not exist', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        provider.address,
                        reserveToken.address,
                        1,
                        2
                    )
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when attempting to deposit an invalid amount', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        provider.address,
                        reserveToken.address,
                        0,
                        2
                    )
                ).to.be.revertedWith('ZeroValue');
            });

            context('with a registered pool', () => {
                let poolToken: PoolToken;

                beforeEach(async () => {
                    poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);
                });

                context('when at the deposit limit', () => {
                    const DEPOSIT_LIMIT = toWei(12_345);

                    beforeEach(async () => {
                        await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                        await poolCollection.setDepositLimit(reserveToken.address, DEPOSIT_LIMIT);
                        await poolCollection.setInitialRate(reserveToken.address, INITIAL_RATE);

                        await network.depositToPoolCollectionForT(
                            poolCollection.address,
                            provider.address,
                            reserveToken.address,
                            DEPOSIT_LIMIT,
                            MAX_UINT256
                        );
                    });

                    it('should revert when attempting to deposit', async () => {
                        await expect(
                            network.depositToPoolCollectionForT(
                                poolCollection.address,
                                provider.address,
                                reserveToken.address,
                                1,
                                MAX_UINT256
                            )
                        ).to.be.revertedWith('DepositLimitExceeded');
                    });
                });

                context('when below the deposit limit', () => {
                    const testDepositFor = async (
                        baseTokenAmount: BigNumber,
                        unallocatedNetworkTokenLiquidity = MAX_UINT256
                    ) => {
                        const prevPoolData = await poolCollection.poolData(reserveToken.address);

                        const prevPoolTokenTotalSupply = await poolToken.totalSupply();
                        const prevProviderPoolTokenBalance = await poolToken.balanceOf(provider.address);

                        let expectedPoolTokenAmount;
                        if (prevPoolTokenTotalSupply.isZero()) {
                            expectedPoolTokenAmount = baseTokenAmount;
                        } else {
                            expectedPoolTokenAmount = baseTokenAmount
                                .mul(prevPoolTokenTotalSupply)
                                .div(prevPoolData.liquidity.stakedBalance);
                        }

                        const depositAmounts = (await network.callStatic.depositToPoolCollectionForT(
                            poolCollection.address,
                            provider.address,
                            reserveToken.address,
                            baseTokenAmount,
                            unallocatedNetworkTokenLiquidity
                        )) as any as DepositAmountsStructOutput;

                        const res = await network.depositToPoolCollectionForT(
                            poolCollection.address,
                            provider.address,
                            reserveToken.address,
                            baseTokenAmount,
                            unallocatedNetworkTokenLiquidity
                        );

                        const poolData = await poolCollection.poolData(reserveToken.address);

                        const minLiquidityForTrading = await networkSettings.minLiquidityForTrading();
                        if (
                            prevPoolData.tradingEnabled &&
                            prevPoolData.liquidity.networkTokenTradingLiquidity.lt(minLiquidityForTrading) &&
                            poolData.liquidity.networkTokenTradingLiquidity.gte(minLiquidityForTrading)
                        ) {
                            await expect(res)
                                .to.emit(poolCollection, 'TradingEnabled')
                                .withArgs(reserveToken.address, true, TRADING_STATUS_UPDATE_MIN_LIQUIDITY);
                        }

                        let rate;
                        if (prevPoolData.liquidity.networkTokenTradingLiquidity.lt(minLiquidityForTrading)) {
                            rate = prevPoolData.initialRate;

                            expect(poolData.averageRate.rate).to.equal(prevPoolData.initialRate);
                        } else {
                            rate = prevPoolData.averageRate.rate;

                            expect(poolData.initialRate).to.equal(ZERO_FRACTION);
                        }

                        let networkTokenDeltaAmount = baseTokenAmount.mul(rate.n).div(rate.d);
                        let baseTokenExcessLiquidity = BigNumber.from(0);
                        if (networkTokenDeltaAmount.gt(unallocatedNetworkTokenLiquidity)) {
                            const unavailableNetworkTokenAmount = networkTokenDeltaAmount.sub(
                                unallocatedNetworkTokenLiquidity
                            );

                            networkTokenDeltaAmount = unallocatedNetworkTokenLiquidity;
                            baseTokenExcessLiquidity = unavailableNetworkTokenAmount.mul(rate.d).div(rate.n);
                        }

                        const baseTokenDeltaAmount = baseTokenAmount.sub(baseTokenExcessLiquidity);

                        const newBaseTokenTradingLiquidity =
                            prevPoolData.liquidity.baseTokenTradingLiquidity.add(baseTokenDeltaAmount);
                        const newNetworkTokenTradingLiquidity =
                            prevPoolData.liquidity.networkTokenTradingLiquidity.add(networkTokenDeltaAmount);

                        expect(depositAmounts.networkTokenDeltaAmount).to.equal(networkTokenDeltaAmount);
                        expect(depositAmounts.baseTokenDeltaAmount).to.equal(baseTokenDeltaAmount);
                        expect(depositAmounts.poolTokenAmount).to.equal(expectedPoolTokenAmount);
                        expect(depositAmounts.poolToken).to.equal(poolToken.address);

                        expect(poolData.liquidity.stakedBalance).to.equal(
                            prevPoolData.liquidity.stakedBalance.add(baseTokenAmount)
                        );
                        expect(poolData.liquidity.baseTokenTradingLiquidity).to.equal(newBaseTokenTradingLiquidity);
                        expect(poolData.liquidity.networkTokenTradingLiquidity).to.equal(
                            newNetworkTokenTradingLiquidity
                        );
                        expect(poolData.liquidity.tradingLiquidityProduct).to.equal(
                            newBaseTokenTradingLiquidity.mul(newNetworkTokenTradingLiquidity)
                        );

                        expect(await poolToken.totalSupply()).to.equal(
                            prevPoolTokenTotalSupply.add(expectedPoolTokenAmount)
                        );
                        expect(await poolToken.balanceOf(provider.address)).to.equal(
                            prevProviderPoolTokenBalance.add(expectedPoolTokenAmount)
                        );
                    };

                    context('without the minimum network token trading liquidity setting', () => {
                        beforeEach(async () => {
                            await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);
                        });

                        it('should revert when attempting to deposit', async () => {
                            await expect(
                                network.depositToPoolCollectionForT(
                                    poolCollection.address,
                                    provider.address,
                                    reserveToken.address,
                                    1,
                                    MAX_UINT256
                                )
                            ).to.be.revertedWith('MinLiquidityNotSet');
                        });
                    });

                    context('with the minimum network token trading liquidity setting', () => {
                        beforeEach(async () => {
                            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                            await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);
                        });

                        context('when below the minimum network token trading liquidity', () => {
                            context('when no initial rate was set', () => {
                                it('should revert when attempting to deposit', async () => {
                                    await expect(
                                        network.depositToPoolCollectionForT(
                                            poolCollection.address,
                                            provider.address,
                                            reserveToken.address,
                                            1,
                                            MAX_UINT256
                                        )
                                    ).to.be.revertedWith('NoInitialRate');
                                });
                            });

                            context('when initial rate was set', () => {
                                beforeEach(async () => {
                                    await poolCollection.setInitialRate(reserveToken.address, INITIAL_RATE);
                                });

                                it('should deposit', async () => {
                                    for (const amount of [1, 10_000, toWei(1_000_000)]) {
                                        await testDepositFor(BigNumber.from(amount));
                                    }
                                });

                                context('when exceeding the unallocated network token liquidity', () => {
                                    it('should deposit', async () => {
                                        for (const amount of [toWei(1_000_000), toWei(10_000_000), toWei(50_000_000)]) {
                                            await testDepositFor(amount, toWei(20_000));
                                        }
                                    });
                                });
                            });
                        });

                        context('when above the minimum network token trading liquidity', () => {
                            beforeEach(async () => {
                                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                                await poolCollection.setInitialRate(reserveToken.address, INITIAL_RATE);

                                await network.depositToPoolCollectionForT(
                                    poolCollection.address,
                                    provider.address,
                                    reserveToken.address,
                                    MIN_LIQUIDITY_FOR_TRADING.mul(INITIAL_RATE.d).div(INITIAL_RATE.n),
                                    MAX_UINT256
                                );
                            });

                            it('should deposit', async () => {
                                for (const amount of [1, 10_000, toWei(1_000_000)]) {
                                    await testDepositFor(BigNumber.from(amount));
                                }
                            });

                            context('when exceeding the unallocated network token liquidity', () => {
                                it('should deposit', async () => {
                                    for (const amount of [toWei(1_000_000), toWei(10_000_000), toWei(50_000_000)]) {
                                        await testDepositFor(amount, toWei(20_000));
                                    }
                                });
                            });
                        });
                    });
                });
            });
        };

        for (const symbol of [ETH, TKN]) {
            context(symbol, () => {
                testDeposit(symbol);
            });
        }
    });

    describe('withdraw', () => {
        const testWithdraw = (symbol: string) => {
            let networkSettings: NetworkSettings;
            let network: TestBancorNetwork;
            let poolCollection: TestPoolCollection;
            let poolToken: PoolToken;
            let reserveToken: TokenWithAddress;

            let provider: SignerWithAddress;

            before(async () => {
                [deployer, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ network, networkSettings, poolCollection } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                reserveToken = await createTokenBySymbol(symbol);

                poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);

                await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);
                await poolCollection.setInitialRate(reserveToken.address, INITIAL_RATE);
            });

            it('should revert when attempting to withdraw from a non-network', async () => {
                const nonNetwork = deployer;

                await expect(
                    poolCollection.connect(nonNetwork).withdraw(reserveToken.address, 1, 1, 1)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to withdraw from an invalid pool', async () => {
                await expect(
                    network.withdrawFromPoolCollectionT(poolCollection.address, ZERO_ADDRESS, 1, 1, 1)
                ).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to withdraw an invalid amount', async () => {
                await expect(
                    network.withdrawFromPoolCollectionT(poolCollection.address, reserveToken.address, 0, 1, 1)
                ).to.be.revertedWith('ZeroValue');
            });

            it('should reset the pool data when the pool is emptied', async () => {
                const baseTokenAmount = 1000;

                await network.depositToPoolCollectionForT(
                    poolCollection.address,
                    provider.address,
                    reserveToken.address,
                    baseTokenAmount,
                    MAX_UINT256
                );

                const prevPoolData = await poolCollection.poolData(reserveToken.address);
                expect(prevPoolData.averageRate.rate).to.equal(prevPoolData.initialRate);

                const poolTokenAmount = await poolToken.balanceOf(provider.address);
                await poolToken.connect(provider).transfer(network.address, poolTokenAmount);
                await network.approveT(poolToken.address, poolCollection.address, poolTokenAmount);

                expect(prevPoolData.liquidity.stakedBalance).to.not.equal(BigNumber.from(0));
                expect(prevPoolData.liquidity.baseTokenTradingLiquidity).to.not.equal(BigNumber.from(0));
                expect(prevPoolData.liquidity.networkTokenTradingLiquidity).to.not.equal(BigNumber.from(0));
                expect(prevPoolData.liquidity.tradingLiquidityProduct).to.not.equal(BigNumber.from(0));
                expect(prevPoolData.averageRate.rate).to.not.equal(ZERO_FRACTION);

                await network.withdrawFromPoolCollectionT(
                    poolCollection.address,
                    reserveToken.address,
                    poolTokenAmount,
                    baseTokenAmount,
                    0
                );

                const poolData = await poolCollection.poolData(reserveToken.address);
                expect(poolData.liquidity.stakedBalance).to.equal(0);
                expect(poolData.liquidity.baseTokenTradingLiquidity).to.equal(0);
                expect(poolData.liquidity.networkTokenTradingLiquidity).to.equal(0);
                expect(poolData.liquidity.tradingLiquidityProduct).to.equal(0);
                expect(poolData.averageRate.rate).to.equal(ZERO_FRACTION);
            });

            for (const percent of [1, 5, 10, 25, 50]) {
                it(`should update the pool data when ${percent}% of the pool is emptied`, async () => {
                    const baseTokenAmount = BigNumber.from(1000);

                    await network.depositToPoolCollectionForT(
                        poolCollection.address,
                        provider.address,
                        reserveToken.address,
                        baseTokenAmount,
                        MAX_UINT256
                    );

                    const prevPoolData = await poolCollection.poolData(reserveToken.address);
                    const poolTokenAmount = await poolToken.balanceOf(provider.address);
                    await poolToken.connect(provider).transfer(network.address, poolTokenAmount);
                    await network.approveT(poolToken.address, poolCollection.address, poolTokenAmount);

                    const stakedBalanceExpected = prevPoolData.liquidity.stakedBalance.mul(100 - percent).div(100);
                    const baseTokenTradingLiquidityExpected = prevPoolData.liquidity.baseTokenTradingLiquidity
                        .mul(100 - percent)
                        .div(100);
                    const networkTokenTradingLiquidityExpected = prevPoolData.liquidity.networkTokenTradingLiquidity
                        .mul(100 - percent)
                        .div(100);
                    const tradingLiquidityProductExpected = baseTokenTradingLiquidityExpected.mul(
                        networkTokenTradingLiquidityExpected
                    );

                    await network.withdrawFromPoolCollectionT(
                        poolCollection.address,
                        reserveToken.address,
                        poolTokenAmount.mul(percent).div(100),
                        baseTokenAmount,
                        BigNumber.from(0)
                    );

                    const poolData = await poolCollection.poolData(reserveToken.address);
                    expect(poolData.liquidity.stakedBalance).to.equal(stakedBalanceExpected);
                    expect(poolData.liquidity.baseTokenTradingLiquidity).to.equal(baseTokenTradingLiquidityExpected);
                    expect(poolData.liquidity.networkTokenTradingLiquidity).to.equal(
                        networkTokenTradingLiquidityExpected
                    );
                    expect(poolData.liquidity.tradingLiquidityProduct).to.equal(tradingLiquidityProductExpected);
                });
            }
        };

        for (const symbol of [ETH, TKN]) {
            context(symbol, () => {
                testWithdraw(symbol);
            });
        }
    });

    describe('trading', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: IERC20;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const MIN_RETURN_AMOUNT = 1;

        beforeEach(async () => {
            ({ network, networkToken, networkSettings, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

            await createPool(reserveToken, network, networkSettings, poolCollection);
        });

        const testTrading = (isSourceNetworkToken: boolean) => {
            const setTradingLiquidity = async (
                networkTokenTradingLiquidity: BigNumber,
                baseTokenTradingLiquidity: BigNumber
            ) =>
                poolCollection.setTradingLiquidityT(reserveToken.address, {
                    networkTokenTradingLiquidity,
                    baseTokenTradingLiquidity,
                    tradingLiquidityProduct: networkTokenTradingLiquidity.mul(baseTokenTradingLiquidity),
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

                it('should revert when attempting to trade from a non-network', async () => {
                    const nonNetwork = deployer;

                    await expect(
                        poolCollection
                            .connect(nonNetwork)
                            .trade(sourceToken.address, targetToken.address, 1, MIN_RETURN_AMOUNT)
                    ).to.be.revertedWith('AccessDenied');
                });

                it('should revert when attempting to trade or query using an invalid source pool', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            ZERO_ADDRESS,
                            targetToken.address,
                            1,
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('InvalidAddress');

                    for (const targetAmount of [true, false]) {
                        await expect(
                            poolCollection.tradeAmountAndFee(ZERO_ADDRESS, targetToken.address, 1, targetAmount)
                        ).to.be.revertedWith('InvalidAddress');
                    }
                });

                it('should revert when attempting to trade or query using an invalid target pool', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            sourceToken.address,
                            ZERO_ADDRESS,
                            1,
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('InvalidAddress');

                    for (const targetAmount of [true, false]) {
                        await expect(
                            poolCollection.tradeAmountAndFee(sourceToken.address, ZERO_ADDRESS, 1, targetAmount)
                        ).to.be.revertedWith('InvalidAddress');
                    }
                });

                it('should revert when attempting to trade or query using a non-existing source pool', async () => {
                    const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
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
                    const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
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
                    const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            reserveToken.address,
                            reserveToken2.address,
                            1,
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('InvalidPoo');

                    for (const targetAmount of [true, false]) {
                        await expect(
                            poolCollection.tradeAmountAndFee(
                                reserveToken.address,
                                reserveToken2.address,
                                1,
                                targetAmount
                            )
                        ).to.be.revertedWith('InvalidPoo');
                    }
                });

                it('should revert when attempting to trade or query using the network token as both of the pools', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            networkToken.address,
                            networkToken.address,
                            1,
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('InvalidPoo');

                    for (const targetAmount of [true, false]) {
                        await expect(
                            poolCollection.tradeAmountAndFee(
                                networkToken.address,
                                networkToken.address,
                                1,
                                targetAmount
                            )
                        ).to.be.revertedWith('InvalidPoo');
                    }
                });

                it('should revert when attempting to trade or query with an invalid amount', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            sourceToken.address,
                            targetToken.address,
                            0,
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('ZeroValue');

                    for (const targetAmount of [true, false]) {
                        await expect(
                            poolCollection.tradeAmountAndFee(sourceToken.address, targetToken.address, 0, targetAmount)
                        ).to.be.revertedWith('ZeroValue');
                    }
                });

                it('should revert when attempting to trade with an invalid minimum return amount', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            sourceToken.address,
                            targetToken.address,
                            1,
                            0
                        )
                    ).to.be.revertedWith('ZeroValue');
                });

                context('when trading is disabled', () => {
                    beforeEach(async () => {
                        await poolCollection.enableTrading(reserveToken.address, false);
                    });

                    it('should revert when attempting to trade or query', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                sourceToken.address,
                                targetToken.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('TradingDisabled');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(
                                    sourceToken.address,
                                    targetToken.address,
                                    1,
                                    targetAmount
                                )
                            ).to.be.revertedWith('TradingDisabled');
                        }
                    });
                });

                context('with insufficient network token liquidity', () => {
                    it('should revert when attempting to trade or query', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                sourceToken.address,
                                targetToken.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('LiquidityTooLow');

                        for (const targetAmount of [true, false]) {
                            await expect(
                                poolCollection.tradeAmountAndFee(
                                    sourceToken.address,
                                    targetToken.address,
                                    1,
                                    targetAmount
                                )
                            ).to.be.revertedWith('LiquidityTooLow');
                        }
                    });
                });

                context('with sufficient network token liquidity', () => {
                    beforeEach(async () => {
                        await setTradingLiquidity(MIN_LIQUIDITY_FOR_TRADING, BigNumber.from(0));
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
                                    sourceToken.address,
                                    targetToken.address,
                                    toWei(12_345),
                                    MAX_UINT256
                                )
                            ).to.be.revertedWith('ReturnAmountTooLow');
                        });
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
                                        sourceToken.address,
                                        targetToken.address,
                                        amount,
                                        MIN_RETURN_AMOUNT
                                    )
                                ).to.be.revertedWith('InvalidPoolBalance');

                                for (const targetAmount of [true, false]) {
                                    await expect(
                                        poolCollection.tradeAmountAndFee(
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            targetAmount
                                        )
                                    ).to.be.revertedWith('InvalidPoolBalance');
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
                                        sourceToken.address,
                                        targetToken.address,
                                        amount,
                                        MIN_RETURN_AMOUNT
                                    )
                                ).to.be.revertedWith('InvalidPoolBalance');

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
                                            ? 'InvalidPoolBalance'
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

                    context(`with (${[sourceBalance, targetBalance, tradingFeePPM, amount]}) [${intervals}]`, () => {
                        type PoolData = AsyncReturnType<TestPoolCollection['poolData']>;
                        const expectedAverageRate = async (poolData: PoolData, timeElapsed: number) => {
                            const { liquidity } = poolData;

                            return poolAverageRate.calcAverageRate(
                                { n: liquidity.networkTokenTradingLiquidity, d: liquidity.baseTokenTradingLiquidity },
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

                            const networkTokenTradingLiquidity = isSourceNetworkToken ? sourceBalance : targetBalance;
                            const baseTokenTradingLiquidity = isSourceNetworkToken ? targetBalance : sourceBalance;
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
                                    sourceToken.address,
                                    targetToken.address,
                                    amount,
                                    MIN_RETURN_AMOUNT
                                );

                                await network.tradePoolCollectionT(
                                    poolCollection.address,
                                    sourceToken.address,
                                    targetToken.address,
                                    amount,
                                    MIN_RETURN_AMOUNT
                                );

                                const expectedTargetAmounts = expectedTargetAmountAndFee(amount, prevPoolData);
                                expect(targetAmountAndFee.amount).to.almostEqual(expectedTargetAmounts.amount, {
                                    maxRelativeError: new Decimal('0.0000000000000000001')
                                });
                                expect(targetAmountAndFee.feeAmount).to.almostEqual(expectedTargetAmounts.feeAmount, {
                                    maxRelativeError: new Decimal('0.000000000000000006'),
                                    relation: Relation.LesserOrEqual
                                });

                                expect(sourceAmountAndFee.amount).to.almostEqual(amount, {
                                    maxRelativeError: new Decimal('0.0000000000000000001')
                                });
                                expect(sourceAmountAndFee.feeAmount).to.almostEqual(targetAmountAndFee.feeAmount, {
                                    maxRelativeError: new Decimal('0.000000000000000002'),
                                    relation: Relation.GreaterOrEqual
                                });

                                const poolData = await poolCollection.poolData(reserveToken.address);
                                const { liquidity } = poolData;

                                expect(tradeAmountsWithLiquidity.amount).to.equal(targetAmountAndFee.amount);
                                expect(tradeAmountsWithLiquidity.feeAmount).to.equal(targetAmountAndFee.feeAmount);
                                expect(tradeAmountsWithLiquidity.liquidity.networkTokenTradingLiquidity).to.equal(
                                    liquidity.networkTokenTradingLiquidity
                                );
                                expect(tradeAmountsWithLiquidity.liquidity.baseTokenTradingLiquidity).to.equal(
                                    liquidity.baseTokenTradingLiquidity
                                );
                                expect(tradeAmountsWithLiquidity.liquidity.tradingLiquidityProduct).to.equal(
                                    liquidity.tradingLiquidityProduct
                                );
                                expect(tradeAmountsWithLiquidity.liquidity.stakedBalance).to.equal(
                                    liquidity.stakedBalance
                                );

                                if (isSourceNetworkToken) {
                                    expect(liquidity.networkTokenTradingLiquidity).to.equal(
                                        prevLiquidity.networkTokenTradingLiquidity.add(amount)
                                    );
                                    expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                        prevLiquidity.baseTokenTradingLiquidity.sub(tradeAmountsWithLiquidity.amount)
                                    );
                                    expect(liquidity.stakedBalance).to.equal(
                                        prevLiquidity.stakedBalance.add(tradeAmountsWithLiquidity.feeAmount)
                                    );
                                } else {
                                    expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                        prevLiquidity.baseTokenTradingLiquidity.add(amount)
                                    );
                                    expect(liquidity.networkTokenTradingLiquidity).to.equal(
                                        prevLiquidity.networkTokenTradingLiquidity.sub(tradeAmountsWithLiquidity.amount)
                                    );
                                }

                                expect(liquidity.tradingLiquidityProduct).to.equal(
                                    prevLiquidity.tradingLiquidityProduct
                                );

                                // verify that the average rate has been updated
                                const expectedNewAverageRate = await expectedAverageRate(prevPoolData, interval);
                                expect(poolData.averageRate.time).to.equal(expectedNewAverageRate.time);
                                expect(poolData.averageRate.rate).to.equal(expectedNewAverageRate.rate);
                            }
                        });
                    });
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

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

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
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to notify about collected fee from a non-existing pool', async () => {
            const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

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

            await externalRewardsVault.grantRole(roles.ExternalRewardsVault.ROLE_ASSET_MANAGER, deployer.address);

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, toWei(1_000_000_000));

            poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);
            await poolCollection.setInitialRate(reserveToken.address, INITIAL_RATE);

            await network.depositToPoolCollectionForT(
                poolCollection.address,
                deployer.address,
                reserveToken.address,
                BASE_TOKEN_LIQUIDITY,
                MAX_UINT256
            );
        });

        for (const baseTokenAmount of [0, 1000, toWei(20_000), toWei(3_000_000)]) {
            context(`underlying amount of ${baseTokenAmount.toString()}`, () => {
                it('should properly convert between underlying amount and pool token amount', async () => {
                    const poolTokenTotalSupply = await poolToken.totalSupply();
                    const { stakedBalance } = await poolCollection.poolLiquidity(reserveToken.address);

                    const poolTokenAmount = await poolCollection.underlyingToPoolToken(
                        reserveToken.address,
                        baseTokenAmount
                    );
                    expect(poolTokenAmount).to.equal(
                        BigNumber.from(baseTokenAmount).mul(poolTokenTotalSupply).div(stakedBalance)
                    );

                    const underlyingAmount = await poolCollection.poolTokenToUnderlying(
                        reserveToken.address,
                        poolTokenAmount
                    );
                    expect(underlyingAmount).to.be.closeTo(BigNumber.from(baseTokenAmount), 1);
                });

                for (const protocolPoolTokenAmount of [0, 100_000, toWei(50_000)]) {
                    context(`protocol pool token amount of ${protocolPoolTokenAmount} `, () => {
                        beforeEach(async () => {
                            if (protocolPoolTokenAmount !== 0) {
                                await poolCollection.mintT(
                                    reserveToken.address,
                                    externalRewardsVault.address,
                                    protocolPoolTokenAmount
                                );
                            }
                        });

                        it('should properly calculate pool token amount to burn in order to increase underlying value', async () => {
                            const poolTokenAmount = await poolToken.balanceOf(deployer.address);

                            const stakingRewardsMath = await Contracts.TestStakingRewardsMath.deploy();
                            const poolTokenAmountToBurn = await stakingRewardsMath.calcPoolTokenAmountToBurn(
                                await poolToken.totalSupply(),
                                await poolToken.balanceOf(externalRewardsVault.address),
                                await poolCollection.poolStakedBalance(reserveToken.address),
                                baseTokenAmount
                            );

                            const prevUnderlying = await poolCollection.poolTokenToUnderlying(reserveToken.address, poolTokenAmount);
                            await poolToken.connect(deployer).burn(poolTokenAmountToBurn);
                            const currUnderlying = await poolCollection.poolTokenToUnderlying(reserveToken.address, poolTokenAmount);

                            // ensure that burning the resulted pool token amount increases the underlying by the
                            // specified network amount while taking into account pool tokens owned by the protocol
                            // (note that, for this test, it doesn't matter where from the pool tokens are being burned)
                            expect(currUnderlying).to.be.closeTo(prevUnderlying.add(baseTokenAmount), 1);
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
                networkSettings,
                poolTokenFactory,
                poolCollection,
                poolCollectionUpgrader
            } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);

            poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);

            targetPoolCollection = await createPoolCollection(
                network,
                networkToken,
                networkSettings,
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
                ).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to migrate a pool out of a pool collection to an invalid pool collection', async () => {
                await expect(
                    poolCollectionUpgrader.migratePoolOutT(poolCollection.address, reserveToken.address, ZERO_ADDRESS)
                ).to.be.revertedWith('InvalidAddress');

                const newPoolCollection = await createPoolCollection(
                    network,
                    networkToken,
                    networkSettings,
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
                const reserveToken2 = await Contracts.TestERC20Token.deploy(TKN, TKN, 1_000_000);
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
