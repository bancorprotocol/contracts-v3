import { AsyncReturnType } from '../../components/ContractBuilder';
import Contracts, {
    BNTPool,
    ExternalProtectionVault,
    ExternalRewardsVault,
    IERC20,
    MasterVault,
    NetworkSettings,
    PoolToken,
    PoolTokenFactory,
    TestBancorNetwork,
    TestBNTPool,
    TestERC20Token,
    TestPoolCollection,
    TestPoolMigrator
} from '../../components/Contracts';
import { PoolLiquidityStructOutput } from '../../typechain-types/contracts/helpers/TestPoolCollection';
import {
    BOOTSTRAPPING_LIQUIDITY_BUFFER_FACTOR,
    DEFAULT_TRADING_FEE_PPM,
    EMA_AVERAGE_RATE_WEIGHT,
    EMA_SPOT_RATE_WEIGHT,
    LIQUIDITY_GROWTH_FACTOR,
    MAX_UINT256,
    PoolType,
    PPM_RESOLUTION,
    RATE_MAX_DEVIATION_PPM,
    TradingStatusUpdateReason,
    ZERO_ADDRESS,
    ZERO_BYTES32,
    ZERO_FRACTION
} from '../../utils/Constants';
import { Roles } from '../../utils/Roles';
import { TokenData, TokenSymbol } from '../../utils/TokenData';
import { max, min, toPPM, toWei } from '../../utils/Types';
import { latestBlockNumber } from '..//helpers/BlockNumber';
import { getBalance, transfer } from '..//helpers/Utils';
import {
    createPool,
    createPoolCollection,
    createSystem,
    createTestToken,
    createToken,
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
    const BNT_VIRTUAL_BALANCE = 1;
    const BASE_TOKEN_VIRTUAL_BALANCE = 2;
    const MIN_LIQUIDITY_FOR_TRADING = toWei(500);
    const CONTEXT_ID = formatBytes32String('CTX');

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    const testLiquidityReset = async (
        token: TokenWithAddress,
        poolCollection: TestPoolCollection,
        bntPool: BNTPool,
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
        expect(data.averageRate.blockNumber).to.equal(0);
        expect(data.averageRate.rate).to.equal(ZERO_FRACTION);

        expect(liquidity.bntTradingLiquidity).to.equal(0);
        expect(liquidity.baseTokenTradingLiquidity).to.equal(0);
        expect(liquidity.stakedBalance).to.equal(expectedStakedBalance);

        // ensure that the previous BNT liquidity was renounced
        expect(await bntPool.currentPoolFunding(token.address)).to.equal(expectedFunding);
    };

    const testTradingLiquidityEvents = async (
        token: TokenWithAddress,
        poolCollection: TestPoolCollection,
        masterVault: MasterVault,
        bnt: IERC20,
        prevLiquidity: PoolLiquidityStructOutput,
        newLiquidity: PoolLiquidityStructOutput,
        contextId: string,
        res: ContractTransaction
    ) => {
        if (!prevLiquidity.bntTradingLiquidity.eq(newLiquidity.bntTradingLiquidity)) {
            await expect(res)
                .to.emit(poolCollection, 'TradingLiquidityUpdated')
                .withArgs(
                    contextId,
                    token.address,
                    bnt.address,
                    prevLiquidity.bntTradingLiquidity,
                    newLiquidity.bntTradingLiquidity
                );
        } else {
            await expect(res).not.to.emit(poolCollection, 'TradingLiquidityUpdated');
        }

        if (!prevLiquidity.baseTokenTradingLiquidity.eq(newLiquidity.baseTokenTradingLiquidity)) {
            await expect(res)
                .to.emit(poolCollection, 'TradingLiquidityUpdated')
                .withArgs(
                    contextId,
                    token.address,
                    token.address,
                    prevLiquidity.baseTokenTradingLiquidity,
                    newLiquidity.baseTokenTradingLiquidity
                );
        } else {
            await expect(res).not.to.emit(poolCollection, 'TradingLiquidityUpdated');
        }

        const poolToken = await Contracts.PoolToken.attach(await poolCollection.poolToken(token.address));

        if (!prevLiquidity.stakedBalance.eq(newLiquidity.stakedBalance)) {
            await expect(res)
                .to.emit(poolCollection, 'TotalLiquidityUpdated')
                .withArgs(
                    contextId,
                    token.address,
                    await getBalance(token, masterVault.address),
                    newLiquidity.stakedBalance,
                    await poolToken.totalSupply()
                );
        } else {
            await expect(res).not.to.emit(poolCollection, 'TotalLiquidityUpdated');
        }
    };

    describe('construction', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkSettings: NetworkSettings;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let bntPool: TestBNTPool;
        let poolTokenFactory: PoolTokenFactory;
        let poolMigrator: TestPoolMigrator;

        beforeEach(async () => {
            ({
                network,
                bnt,
                networkSettings,
                masterVault,
                externalProtectionVault,
                bntPool,
                poolTokenFactory,
                poolMigrator
            } = await createSystem());
        });

        it('should revert when attempting to create with an invalid network contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    ZERO_ADDRESS,
                    bnt.address,
                    networkSettings.address,
                    masterVault.address,
                    bntPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolMigrator.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    ZERO_ADDRESS,
                    networkSettings.address,
                    masterVault.address,
                    bntPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolMigrator.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid network settings contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    bnt.address,
                    ZERO_ADDRESS,
                    masterVault.address,
                    bntPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolMigrator.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid master vault contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    bnt.address,
                    networkSettings.address,
                    ZERO_ADDRESS,
                    bntPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolMigrator.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid BNT pool contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    bnt.address,
                    networkSettings.address,
                    masterVault.address,
                    ZERO_ADDRESS,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    poolMigrator.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid external protection vault contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    bnt.address,
                    networkSettings.address,
                    masterVault.address,
                    bntPool.address,
                    ZERO_ADDRESS,
                    poolTokenFactory.address,
                    poolMigrator.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pool token factory contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    bnt.address,
                    networkSettings.address,
                    masterVault.address,
                    bntPool.address,
                    externalProtectionVault.address,
                    ZERO_ADDRESS,
                    poolMigrator.address
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should revert when attempting to create with an invalid pool migrator contract', async () => {
            await expect(
                Contracts.PoolCollection.deploy(
                    network.address,
                    bnt.address,
                    networkSettings.address,
                    masterVault.address,
                    bntPool.address,
                    externalProtectionVault.address,
                    poolTokenFactory.address,
                    ZERO_ADDRESS
                )
            ).to.be.revertedWith('InvalidAddress');
        });

        it('should be properly initialized', async () => {
            const poolCollection = await Contracts.PoolCollection.deploy(
                network.address,
                bnt.address,
                networkSettings.address,
                masterVault.address,
                bntPool.address,
                externalProtectionVault.address,
                poolTokenFactory.address,
                poolMigrator.address
            );
            expect(await poolCollection.version()).to.equal(2);

            expect(await poolCollection.poolType()).to.equal(PoolType.Standard);
            expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

            await expect(poolCollection.deployTransaction)
                .to.emit(poolCollection, 'DefaultTradingFeePPMUpdated')
                .withArgs(0, DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('default trading fee', () => {
        const newDefaultTradingFee = toPPM(10);

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
                poolCollection.connect(nonOwner).setDefaultTradingFeePPM(newDefaultTradingFee)
            ).to.be.revertedWith('AccessDenied');
        });

        it('should revert when setting the default trading fee to an invalid value', async () => {
            await expect(poolCollection.setDefaultTradingFeePPM(PPM_RESOLUTION + 1)).to.be.revertedWith('InvalidFee');
        });

        it('should ignore updating to the same default trading fee', async () => {
            await poolCollection.setDefaultTradingFeePPM(newDefaultTradingFee);

            const res = await poolCollection.setDefaultTradingFeePPM(newDefaultTradingFee);
            await expect(res).not.to.emit(poolCollection, 'DefaultTradingFeePPMUpdated');
        });

        it('should be able to set and update the default trading fee', async () => {
            const res = await poolCollection.setDefaultTradingFeePPM(newDefaultTradingFee);
            await expect(res)
                .to.emit(poolCollection, 'DefaultTradingFeePPMUpdated')
                .withArgs(DEFAULT_TRADING_FEE_PPM, newDefaultTradingFee);

            expect(await poolCollection.defaultTradingFeePPM()).to.equal(newDefaultTradingFee);

            // ensure that the new default trading fee is used during the creation of newer pools
            await createPool(reserveToken, network, networkSettings, poolCollection);

            const pool = await poolCollection.poolData(reserveToken.address);
            expect(pool.tradingFeePPM).to.equal(newDefaultTradingFee);
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
                    expect(pool.averageRate.blockNumber).to.equal(0);
                    expect(pool.averageRate.rate).to.equal(ZERO_FRACTION);
                    expect(pool.depositLimit).to.equal(0);

                    const { liquidity } = pool;
                    expect(liquidity.baseTokenTradingLiquidity).to.equal(0);
                    expect(liquidity.bntTradingLiquidity).to.equal(0);
                    expect(liquidity.stakedBalance).to.equal(0);

                    const poolLiquidity = await poolCollection.poolLiquidity(reserveToken.address);
                    expect(poolLiquidity.baseTokenTradingLiquidity).to.equal(liquidity.baseTokenTradingLiquidity);
                    expect(poolLiquidity.bntTradingLiquidity).to.equal(liquidity.bntTradingLiquidity);
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
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let masterVault: MasterVault;
        let poolCollection: TestPoolCollection;

        let provider: SignerWithAddress;
        let token: TokenWithAddress;

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, bnt, networkSettings, bntPool, masterVault, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const testActivation = async (tokenData: TokenData) => {
            const testEnableTrading = async (totalLiquidity: BigNumber) => {
                expect(await bntPool.currentPoolFunding(token.address)).to.equal(0);

                const { liquidity: prevLiquidity } = await poolCollection.poolData(token.address);

                const res = await poolCollection.enableTrading(
                    token.address,
                    BNT_VIRTUAL_BALANCE,
                    BASE_TOKEN_VIRTUAL_BALANCE
                );

                const data = await poolCollection.poolData(token.address);
                const { liquidity } = data;

                expect(data.averageRate.blockNumber).to.equal(await poolCollection.currentBlockNumber());
                expect(data.averageRate.rate).to.equal({ n: BNT_VIRTUAL_BALANCE, d: BASE_TOKEN_VIRTUAL_BALANCE });

                expect(data.tradingEnabled).to.be.true;

                expect(liquidity.bntTradingLiquidity).to.equal(
                    MIN_LIQUIDITY_FOR_TRADING.mul(BOOTSTRAPPING_LIQUIDITY_BUFFER_FACTOR)
                );
                expect(liquidity.baseTokenTradingLiquidity).to.equal(
                    liquidity.bntTradingLiquidity.mul(BASE_TOKEN_VIRTUAL_BALANCE).div(BNT_VIRTUAL_BALANCE)
                );
                expect(liquidity.stakedBalance).to.equal(totalLiquidity);

                // ensure that the new BNT funding was requested
                expect(await bntPool.currentPoolFunding(token.address)).to.equal(liquidity.bntTradingLiquidity);

                await expect(res)
                    .to.emit(poolCollection, 'TradingEnabled')
                    .withArgs(token.address, true, TradingStatusUpdateReason.Admin);

                await testTradingLiquidityEvents(
                    token,
                    poolCollection,
                    masterVault,
                    bnt,
                    prevLiquidity,
                    liquidity,
                    ZERO_BYTES32,
                    res
                );
            };

            beforeEach(async () => {
                if (tokenData.isBNT()) {
                    token = bnt;
                } else {
                    token = await createToken(tokenData);
                }

                await createPool(token, network, networkSettings, poolCollection);

                await networkSettings.setFundingLimit(token.address, MAX_UINT256);

                await poolCollection.setDepositLimit(token.address, MAX_UINT256);
            });

            it('should revert when a non-owner attempts to enable trading', async () => {
                await expect(
                    poolCollection
                        .connect(nonOwner)
                        .enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when enabling trading an invalid pool', async () => {
                await expect(
                    poolCollection.enableTrading(ZERO_ADDRESS, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE)
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when enabling trading a non-existing pool', async () => {
                const newReserveToken = await createTestToken();
                await expect(
                    poolCollection.enableTrading(
                        newReserveToken.address,
                        BNT_VIRTUAL_BALANCE,
                        BASE_TOKEN_VIRTUAL_BALANCE
                    )
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when enabling trading with an invalid funding rate', async () => {
                await expect(poolCollection.enableTrading(token.address, 0, 1)).to.be.revertedWith('InvalidRate');
            });

            context('when no base token liquidity was deposited', () => {
                it('should revert', async () => {
                    await expect(
                        poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE)
                    ).to.be.revertedWith('InsufficientLiquidity');
                });
            });

            context('with a base token liquidity deposit', () => {
                const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                    .div(BNT_VIRTUAL_BALANCE)
                    .mul(1000);

                beforeEach(async () => {
                    await depositToPool(provider, token, INITIAL_LIQUIDITY, network);
                });

                it('should enable trading', async () => {
                    await testEnableTrading(INITIAL_LIQUIDITY);
                });

                it('should save the reduced funding rate', async () => {
                    const bntVirtualBalance = MAX_UINT256.div(2);
                    const baseTokenVirtualBalance = MAX_UINT256.div(4);
                    await poolCollection.enableTrading(token.address, bntVirtualBalance, baseTokenVirtualBalance);

                    const {
                        averageRate: { rate }
                    } = await poolCollection.poolData(token.address);

                    expect(rate).not.to.equal({ n: bntVirtualBalance, d: baseTokenVirtualBalance });
                    expect(rate).to.almostEqual(
                        { n: bntVirtualBalance, d: baseTokenVirtualBalance },
                        {
                            maxRelativeError: new Decimal('0.000000000000000000000001')
                        }
                    );
                });

                it('should revert when attempting to enable trading twice', async () => {
                    await poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE);
                    await expect(
                        poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE)
                    ).to.be.revertedWith('AlreadyEnabled');
                });

                context('when the pool funding limit is below the minimum liquidity for trading', () => {
                    beforeEach(async () => {
                        await networkSettings.setFundingLimit(token.address, MIN_LIQUIDITY_FOR_TRADING.sub(1));
                    });

                    it('should revert', async () => {
                        await expect(
                            poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE)
                        ).to.be.revertedWith('InsufficientLiquidity');
                    });
                });

                context('when the matched target network liquidity is below the minimum liquidity for trading', () => {
                    it('should revert', async () => {
                        // use a funding rate such that the resulting matched target network liquidity is insufficient
                        await expect(
                            poolCollection.enableTrading(
                                token.address,
                                MIN_LIQUIDITY_FOR_TRADING.sub(1),
                                INITIAL_LIQUIDITY
                            )
                        ).to.be.revertedWith('InsufficientLiquidity');
                    });
                });
            });

            context('with multiple base token liquidity deposits', () => {
                const DEPOSITS_COUNT = 10;
                const INITIAL_LIQUIDITY =
                    MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE).div(BNT_VIRTUAL_BALANCE);
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
        let bnt: IERC20;
        let bntPool: TestBNTPool;
        let poolCollection: TestPoolCollection;

        let provider: SignerWithAddress;
        let token: TokenWithAddress;

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        beforeEach(async () => {
            ({ network, bnt, networkSettings, bntPool, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
        });

        const testDisableTrading = async (tokenData: TokenData) => {
            const testReset = async (expectedStakedBalance: BigNumberish) => {
                const { tradingEnabled: prevTradingEnabled } = await poolCollection.poolData(token.address);
                const res = await poolCollection.disableTrading(token.address);

                return testLiquidityReset(
                    token,
                    poolCollection,
                    bntPool,
                    prevTradingEnabled,
                    res,
                    expectedStakedBalance,
                    0,
                    TradingStatusUpdateReason.Admin
                );
            };

            beforeEach(async () => {
                if (tokenData.isBNT()) {
                    token = bnt;
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
                    expect(liquidity.bntTradingLiquidity).to.equal(0);
                    expect(liquidity.baseTokenTradingLiquidity).to.equal(0);
                    expect(liquidity.stakedBalance).to.equal(0);
                });

                it('should reset the trading liquidity', async () => {
                    await testReset(0);
                });
            });

            context('when trading is enabled', () => {
                const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                    .div(BNT_VIRTUAL_BALANCE)
                    .mul(10_000);

                beforeEach(async () => {
                    await depositToPool(provider, token, INITIAL_LIQUIDITY, network);

                    await poolCollection.enableTrading(token.address, BNT_VIRTUAL_BALANCE, BASE_TOKEN_VIRTUAL_BALANCE);

                    const { tradingEnabled } = await poolCollection.poolData(token.address);
                    expect(tradingEnabled).to.be.true;
                });

                it('should reset the trading liquidity', async () => {
                    await testReset(INITIAL_LIQUIDITY);
                });

                context('with an initialized average rate', () => {
                    beforeEach(async () => {
                        await poolCollection.setAverageRateT(token.address, {
                            blockNumber: 1000,
                            rate: {
                                n: 1234,
                                d: 100
                            }
                        });

                        const data = await poolCollection.poolData(token.address);
                        const { averageRate } = data;

                        expect(averageRate.blockNumber).to.be.gte(0);
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
            let bnt: IERC20;
            let bntPool: BNTPool;
            let masterVault: MasterVault;
            let poolCollection: TestPoolCollection;
            let token: TokenWithAddress;

            let provider: SignerWithAddress;

            before(async () => {
                [, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ network, bnt, networkSettings, bntPool, masterVault, poolCollection } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

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

                    await poolCollection.setBlockNumber(await latestBlockNumber());
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
                    const prevFunding = await bntPool.currentPoolFunding(token.address);

                    let expectedPoolTokenAmount;
                    if (prevPoolTokenTotalSupply.isZero()) {
                        expectedPoolTokenAmount = tokenAmount;
                    } else {
                        expectedPoolTokenAmount = BigNumber.from(tokenAmount)
                            .mul(prevPoolTokenTotalSupply)
                            .div(prevLiquidity.stakedBalance);
                    }

                    const poolTokenAmount = await network.callStatic.depositToPoolCollectionForT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        token.address,
                        tokenAmount
                    );

                    expect(poolTokenAmount).to.equal(expectedPoolTokenAmount);

                    const res = await network.depositToPoolCollectionForT(
                        poolCollection.address,
                        CONTEXT_ID,
                        provider.address,
                        token.address,
                        tokenAmount
                    );

                    await expect(res)
                        .to.emit(poolCollection, 'TokensDeposited')
                        .withArgs(CONTEXT_ID, provider.address, token.address, tokenAmount, expectedPoolTokenAmount);

                    const poolData = await poolCollection.poolData(token.address);
                    const { liquidity } = poolData;

                    await testTradingLiquidityEvents(
                        token,
                        poolCollection,
                        masterVault,
                        bnt,
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
                                bntPool,
                                prevTradingEnabled,
                                res,
                                prevLiquidity.stakedBalance.add(tokenAmount),
                                prevFunding.sub(prevLiquidity.bntTradingLiquidity),
                                TradingStatusUpdateReason.MinLiquidity
                            );

                            expect(liquidity.bntTradingLiquidity).to.equal(0);
                            expect(liquidity.baseTokenTradingLiquidity).to.equal(0);

                            break;

                        case TradingLiquidityState.Ignore:
                            expect(liquidity.bntTradingLiquidity).to.equal(prevLiquidity.bntTradingLiquidity);
                            expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                prevLiquidity.baseTokenTradingLiquidity
                            );

                            break;

                        case TradingLiquidityState.Update:
                            {
                                expect(prevLiquidity.bntTradingLiquidity).to.be.gte(0);

                                let targetBNTTradingLiquidity = min(
                                    prevLiquidity.baseTokenTradingLiquidity
                                        .mul(prevAverageRate.rate.n)
                                        .div(prevAverageRate.rate.d),
                                    prevLiquidity.bntTradingLiquidity.add(await bntPool.availableFunding(token.address))
                                );

                                if (targetBNTTradingLiquidity.gte(prevLiquidity.bntTradingLiquidity)) {
                                    targetBNTTradingLiquidity = min(
                                        targetBNTTradingLiquidity,
                                        prevLiquidity.bntTradingLiquidity.mul(LIQUIDITY_GROWTH_FACTOR)
                                    );
                                }

                                // ensure that the new BNT funding was updated
                                if (targetBNTTradingLiquidity.gt(prevLiquidity.bntTradingLiquidity)) {
                                    expect(await bntPool.currentPoolFunding(token.address)).to.equal(
                                        prevFunding.add(
                                            targetBNTTradingLiquidity.sub(prevLiquidity.bntTradingLiquidity)
                                        )
                                    );
                                } else if (targetBNTTradingLiquidity.lt(prevLiquidity.bntTradingLiquidity)) {
                                    expect(await bntPool.currentPoolFunding(token.address)).to.equal(
                                        prevFunding.sub(
                                            prevLiquidity.bntTradingLiquidity.sub(targetBNTTradingLiquidity)
                                        )
                                    );
                                }
                            }

                            break;
                    }
                };

                const testMultipleDepositsFor = async (expectTradingLiquidity: TradingLiquidityState) => {
                    for (let i = 0; i < COUNT; i++) {
                        await testDepositFor(AMOUNT, expectTradingLiquidity);
                    }
                };

                context('when depositing is disabled', () => {
                    beforeEach(async () => {
                        await poolCollection.enableDepositing(token.address, false);
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
                        ).to.be.revertedWith('DepositingDisabled');
                    });
                });

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
                            await testMultipleDepositsFor(TradingLiquidityState.Reset);
                        });
                    });
                });

                context('when trading is enabled', () => {
                    const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                        .div(BNT_VIRTUAL_BALANCE)
                        .mul(1000);

                    beforeEach(async () => {
                        await depositToPool(provider, token, INITIAL_LIQUIDITY, network);

                        await poolCollection.enableTrading(
                            token.address,
                            BNT_VIRTUAL_BALANCE,
                            BASE_TOKEN_VIRTUAL_BALANCE
                        );

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

                    context('when the BNT liquidity for trading is zero', () => {
                        it('should deposit without updating the trading liquidity', async () => {
                            const availableFunding = await bntPool.currentPoolFunding(token.address);
                            await networkSettings.setFundingLimit(token.address, availableFunding.mul(2));
                            await networkSettings.setMinLiquidityForTrading(availableFunding.sub(1));
                            await transfer(deployer, token, masterVault, availableFunding.add(1));

                            await poolCollection.setTradingLiquidityT(token.address, {
                                bntTradingLiquidity: 0,
                                baseTokenTradingLiquidity: 0,
                                stakedBalance: 1
                            });

                            await poolCollection.setAverageRateT(token.address, {
                                blockNumber: await poolCollection.currentBlockNumber(),
                                rate: {
                                    n: 1,
                                    d: 1
                                }
                            });

                            const tokenAmount = toWei(1);

                            const expectedPoolTokenAmount = await network.callStatic.depositToPoolCollectionForT(
                                poolCollection.address,
                                CONTEXT_ID,
                                provider.address,
                                token.address,
                                tokenAmount
                            );

                            const { liquidity: prevLiquidity } = await poolCollection.poolData(token.address);

                            const res = await network.depositToPoolCollectionForT(
                                poolCollection.address,
                                CONTEXT_ID,
                                provider.address,
                                token.address,
                                tokenAmount
                            );

                            const { liquidity, averageRate } = await poolCollection.poolData(token.address);

                            await expect(res).to.not.emit(poolCollection, 'TradingLiquidityUpdated');

                            await expect(res)
                                .to.emit(poolCollection, 'TokensDeposited')
                                .withArgs(
                                    CONTEXT_ID,
                                    provider.address,
                                    token.address,
                                    tokenAmount,
                                    expectedPoolTokenAmount
                                );

                            await testTradingLiquidityEvents(
                                token,
                                poolCollection,
                                masterVault,
                                bnt,
                                prevLiquidity,
                                liquidity,
                                CONTEXT_ID,
                                res
                            );

                            expect(averageRate.rate.n).to.equal(1);
                            expect(averageRate.rate.d).to.equal(1);
                        });
                    });

                    context('when below the deposit limit', () => {
                        context(
                            'when the new BNT liquidity for trading is below the minimum liquidity for trading',
                            () => {
                                context('pool is uninitialized', () => {
                                    beforeEach(async () => {
                                        await poolCollection.setAverageRateT(token.address, {
                                            blockNumber: await poolCollection.currentBlockNumber(),
                                            rate: { n: 0, d: 1 }
                                        });
                                    });

                                    it('should deposit and reset the trading liquidity', async () => {
                                        await testMultipleDepositsFor(TradingLiquidityState.Reset);
                                    });
                                });

                                context('pool is unstable', () => {
                                    beforeEach(async () => {
                                        const liquidity = await poolCollection.poolLiquidity(token.address);

                                        await poolCollection.setAverageRateT(token.address, {
                                            blockNumber: await poolCollection.currentBlockNumber(),
                                            rate: {
                                                n: liquidity.baseTokenTradingLiquidity,
                                                d: liquidity.bntTradingLiquidity
                                            }
                                        });
                                    });

                                    it('should deposit without resetting the trading liquidity', async () => {
                                        await testMultipleDepositsFor(TradingLiquidityState.Ignore);
                                    });
                                });

                                context('pool is stable', () => {
                                    beforeEach(async () => {
                                        const liquidity = await poolCollection.poolLiquidity(token.address);

                                        await poolCollection.setAverageRateT(token.address, {
                                            blockNumber: await poolCollection.currentBlockNumber(),
                                            rate: {
                                                n: liquidity.bntTradingLiquidity,
                                                d: liquidity.baseTokenTradingLiquidity
                                            }
                                        });
                                    });

                                    it('should deposit and update the trading liquidity', async () => {
                                        await testMultipleDepositsFor(TradingLiquidityState.Update);
                                    });
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
                                    bntTradingLiquidity: SPOT_RATE.n,
                                    baseTokenTradingLiquidity: SPOT_RATE.d,
                                    stakedBalance
                                });

                                await poolCollection.setAverageRateT(token.address, {
                                    blockNumber: await poolCollection.currentBlockNumber(),
                                    rate: {
                                        n: SPOT_RATE.n.mul(PPM_RESOLUTION),
                                        d: SPOT_RATE.d.mul(PPM_RESOLUTION + RATE_MAX_DEVIATION_PPM + toPPM(0.5))
                                    }
                                });

                                expect(await poolCollection.isPoolRateStable(token.address)).to.be.false;
                            });

                            it('should deposit liquidity and preserve the trading liquidity', async () => {
                                await testMultipleDepositsFor(TradingLiquidityState.Ignore);
                            });
                        });

                        context('when the pool is stable', () => {
                            beforeEach(async () => {
                                const { liquidity } = await poolCollection.poolData(token.address);

                                await poolCollection.setAverageRateT(token.address, {
                                    blockNumber: await poolCollection.currentBlockNumber(),
                                    rate: {
                                        n: liquidity.bntTradingLiquidity,
                                        d: liquidity.baseTokenTradingLiquidity
                                    }
                                });

                                expect(await poolCollection.isPoolRateStable(token.address)).to.be.true;
                            });

                            it('should deposit and update the trading liquidity', async () => {
                                await testMultipleDepositsFor(TradingLiquidityState.Update);
                            });

                            context('when the pool funding limit is below the minimum liquidity for trading', () => {
                                beforeEach(async () => {
                                    await networkSettings.setFundingLimit(
                                        token.address,
                                        MIN_LIQUIDITY_FOR_TRADING.sub(1)
                                    );
                                });

                                it('should deposit and update the trading liquidity', async () => {
                                    await testMultipleDepositsFor(TradingLiquidityState.Update);
                                });
                            });

                            context(
                                'when the matched target network liquidity is below the minimum liquidity for trading',
                                () => {
                                    beforeEach(async () => {
                                        await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                                    });

                                    it('should deposit and reset the trading liquidity', async () => {
                                        await testMultipleDepositsFor(TradingLiquidityState.Reset);
                                    });
                                }
                            );

                            context(
                                'when the matched target network liquidity is below the current network liquidity',
                                () => {
                                    beforeEach(async () => {
                                        // ensure that the pool grew a bit and then retroactive reduce the funding
                                        // limit to 0 to force the shrinking of the pool
                                        await testMultipleDepositsFor(TradingLiquidityState.Update);

                                        await networkSettings.setFundingLimit(token.address, MIN_LIQUIDITY_FOR_TRADING);
                                    });

                                    it('should deposit and update the trading liquidity', async () => {
                                        await testMultipleDepositsFor(TradingLiquidityState.Update);
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
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let poolCollection: TestPoolCollection;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let bntPool: TestBNTPool;
        let poolToken: PoolToken;
        let token: TokenWithAddress;

        let provider: SignerWithAddress;

        enum TradingLiquidityState {
            Reset = 0,
            Update = 1
        }

        before(async () => {
            [, provider] = await ethers.getSigners();
        });

        const withdrawAndVerifyState = async (
            poolTokenAmount: BigNumber,
            withdrawalFeePPM: number,
            expectTradingLiquidity: TradingLiquidityState
        ) => {
            const { liquidity: prevLiquidity, tradingEnabled: prevTradingEnabled } = await poolCollection.poolData(
                token.address
            );

            await poolToken.connect(provider).transfer(network.address, poolTokenAmount);
            await network.approveT(poolToken.address, poolCollection.address, poolTokenAmount);

            const prevPoolTokenTotalSupply = await poolToken.totalSupply();
            const prevNetworkPoolTokenBalance = await poolToken.balanceOf(network.address);
            const prevProviderBalance = await getBalance(token, provider);
            const prevMasterVaultBNTBalance = await getBalance(bnt, masterVault.address);

            const expectedStakedBalance = prevLiquidity.stakedBalance
                .mul(prevPoolTokenTotalSupply.sub(poolTokenAmount))
                .div(prevPoolTokenTotalSupply);

            const underlyingAmount = await poolCollection.poolTokenToUnderlying(token.address, poolTokenAmount);
            const expectedWithdrawalFee = underlyingAmount.mul(withdrawalFeePPM).div(PPM_RESOLUTION);

            const poolWithdrawalAmounts = await poolCollection.poolWithdrawalAmountsT(token.address, poolTokenAmount);

            const bntAmountRenouncedOnResetLiquidity = poolWithdrawalAmounts.newBNTTradingLiquidity.lt(
                await networkSettings.minLiquidityForTrading()
            )
                ? poolWithdrawalAmounts.newBNTTradingLiquidity
                : BigNumber.from(0);

            expect(expectedWithdrawalFee).to.almostEqual(poolWithdrawalAmounts.baseTokensWithdrawalFee, {
                maxAbsoluteError: new Decimal(1)
            });

            const { totalAmount, baseTokenAmount, bntAmount } = await poolCollection.withdrawalAmounts(
                token.address,
                poolTokenAmount
            );

            expect(totalAmount).to.equal(
                poolWithdrawalAmounts.baseTokensWithdrawalAmount.sub(poolWithdrawalAmounts.baseTokensWithdrawalFee)
            );
            expect(baseTokenAmount).to.equal(
                poolWithdrawalAmounts.baseTokensToTransferFromMasterVault.add(
                    poolWithdrawalAmounts.baseTokensToTransferFromEPV
                )
            );
            expect(bntAmount).to.equal(poolWithdrawalAmounts.bntToMintForProvider);

            const res = await network.withdrawFromPoolCollectionT(
                poolCollection.address,
                CONTEXT_ID,
                provider.address,
                token.address,
                poolTokenAmount
            );

            await expect(res)
                .to.emit(poolCollection, 'TokensWithdrawn')
                .withArgs(
                    CONTEXT_ID,
                    provider.address,
                    token.address,
                    baseTokenAmount,
                    poolTokenAmount,
                    poolWithdrawalAmounts.baseTokensToTransferFromEPV,
                    poolWithdrawalAmounts.bntToMintForProvider,
                    poolWithdrawalAmounts.baseTokensWithdrawalFee
                );

            const currMasterVaultBNTBalance = await getBalance(bnt, masterVault.address);
            if (poolWithdrawalAmounts.bntProtocolHoldingsDelta.value.gt(0)) {
                expect(poolWithdrawalAmounts.bntProtocolHoldingsDelta.isNeg).to.be.true;
                expect(currMasterVaultBNTBalance).eq(
                    prevMasterVaultBNTBalance
                        .sub(poolWithdrawalAmounts.bntProtocolHoldingsDelta.value)
                        .sub(bntAmountRenouncedOnResetLiquidity)
                );
            } else if (poolWithdrawalAmounts.bntTradingLiquidityDelta.value.gt(0)) {
                if (poolWithdrawalAmounts.bntTradingLiquidityDelta.isNeg) {
                    expect(currMasterVaultBNTBalance).eq(
                        prevMasterVaultBNTBalance
                            .sub(poolWithdrawalAmounts.bntTradingLiquidityDelta.value)
                            .sub(bntAmountRenouncedOnResetLiquidity)
                    );
                } else {
                    expect(currMasterVaultBNTBalance).eq(
                        prevMasterVaultBNTBalance
                            .add(poolWithdrawalAmounts.bntTradingLiquidityDelta.value)
                            .sub(bntAmountRenouncedOnResetLiquidity)
                    );
                }
            } else {
                expect(currMasterVaultBNTBalance).eq(prevMasterVaultBNTBalance.sub(bntAmountRenouncedOnResetLiquidity));
            }

            const { liquidity } = await poolCollection.poolData(token.address);

            await testTradingLiquidityEvents(
                token,
                poolCollection,
                masterVault,
                bnt,
                prevLiquidity,
                liquidity,
                CONTEXT_ID,
                res
            );

            expect(await poolToken.totalSupply()).to.equal(prevPoolTokenTotalSupply.sub(poolTokenAmount));
            expect(await poolToken.balanceOf(network.address)).to.equal(
                prevNetworkPoolTokenBalance.sub(poolTokenAmount)
            );
            expect(await getBalance(token, provider)).to.equal(prevProviderBalance.add(baseTokenAmount));

            expect(liquidity.stakedBalance).to.equal(expectedStakedBalance);

            switch (expectTradingLiquidity) {
                case TradingLiquidityState.Reset:
                    await testLiquidityReset(
                        token,
                        poolCollection,
                        bntPool,
                        prevTradingEnabled,
                        res,
                        expectedStakedBalance,
                        0,
                        TradingStatusUpdateReason.MinLiquidity
                    );

                    expect(liquidity.bntTradingLiquidity).to.equal(0);
                    expect(liquidity.baseTokenTradingLiquidity).to.equal(0);

                    break;

                case TradingLiquidityState.Update:
                    expect(liquidity.baseTokenTradingLiquidity).to.equal(
                        poolWithdrawalAmounts.newBaseTokenTradingLiquidity
                    );
                    expect(liquidity.bntTradingLiquidity).to.equal(poolWithdrawalAmounts.newBNTTradingLiquidity);

                    break;
            }
        };

        const testWithdrawal = (tokenData: TokenData, withdrawalFeePPM: number) => {
            beforeEach(async () => {
                ({ network, bnt, networkSettings, masterVault, bntPool, poolCollection } = await createSystem());

                token = await createToken(tokenData);

                poolToken = await createPool(token, network, networkSettings, poolCollection);

                await networkSettings.setWithdrawalFeePPM(withdrawalFeePPM);
                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);
                await networkSettings.setFundingLimit(token.address, MAX_UINT256);

                await poolCollection.setDepositLimit(token.address, MAX_UINT256);

                await poolCollection.setBlockNumber(await latestBlockNumber());
            });

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
                const INITIAL_DEPOSIT_AMOUNT = toWei(100_000_000);

                let totalBasePoolTokenAmount: BigNumber;

                beforeEach(async () => {
                    for (let i = 0; i < COUNT; i++) {
                        await transfer(deployer, token, masterVault, INITIAL_DEPOSIT_AMOUNT);

                        const prevBasePoolTokenBalance = await poolToken.balanceOf(provider.address);

                        await network.depositToPoolCollectionForT(
                            poolCollection.address,
                            CONTEXT_ID,
                            provider.address,
                            token.address,
                            INITIAL_DEPOSIT_AMOUNT
                        );

                        totalBasePoolTokenAmount = (await poolToken.balanceOf(provider.address)).sub(
                            prevBasePoolTokenBalance
                        );
                    }
                });

                const testMultipleWithdrawals = async (expectTradingLiquidity: TradingLiquidityState) => {
                    for (let i = 0; i < COUNT; i++) {
                        await withdrawAndVerifyState(
                            totalBasePoolTokenAmount.div(COUNT),
                            withdrawalFeePPM,
                            expectTradingLiquidity
                        );
                    }
                };

                context('when trading is disabled', () => {
                    it('should withdraw', async () => {
                        await testMultipleWithdrawals(TradingLiquidityState.Reset);
                    });

                    context(
                        'when the matched target network liquidity is below the minimum liquidity for trading',
                        () => {
                            beforeEach(async () => {
                                await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                            });

                            it('should withdraw and reset the trading liquidity', async () => {
                                await testMultipleWithdrawals(TradingLiquidityState.Reset);
                            });
                        }
                    );
                });

                context('when trading is enabled', () => {
                    beforeEach(async () => {
                        await poolCollection.enableTrading(
                            token.address,
                            BNT_VIRTUAL_BALANCE,
                            BASE_TOKEN_VIRTUAL_BALANCE
                        );
                    });

                    context(
                        'when the matched target network liquidity is above the minimum liquidity for trading',
                        () => {
                            beforeEach(async () => {
                                const extraLiquidity = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                                    .div(BNT_VIRTUAL_BALANCE)
                                    .mul(10_000);
                                await transfer(deployer, token, masterVault, extraLiquidity);

                                await network.depositToPoolCollectionForT(
                                    poolCollection.address,
                                    CONTEXT_ID,
                                    provider.address,
                                    token.address,
                                    extraLiquidity
                                );
                            });

                            // set each one of the average rate components as follows:
                            // 1. slightly below the minimum permitted deviation of the spot rate from the average rate
                            // 2. precisely at the minimum permitted deviation of the spot rate from the average rate
                            // 3. slightly above the minimum permitted deviation of the spot rate from the average rate
                            // 4. slightly below the maximum permitted deviation of the spot rate from the average rate
                            // 5. precisely at the maximum permitted deviation of the spot rate from the average rate
                            // 6. slightly above the maximum permitted deviation of the spot rate from the average rate
                            // since the average rate has 2 components, this method simulates 36 different scenarios:
                            // - in some of them, the spot rate is within the permitted deviation from the average rate
                            // - in some of them, the spot rate is outside the permitted deviation from the average rate
                            for (const ns of [-1, +1]) {
                                for (const nx of [-1, 0, +1]) {
                                    for (const ds of [-1, +1]) {
                                        for (const dx of [-1, 0, +1]) {
                                            const nf = PPM_RESOLUTION + RATE_MAX_DEVIATION_PPM * ns + nx;
                                            const df = PPM_RESOLUTION + RATE_MAX_DEVIATION_PPM * ds + dx;
                                            const ok = Math.abs(nf / df - 1) <= RATE_MAX_DEVIATION_PPM / PPM_RESOLUTION;

                                            context(`ns=${ns}, nx=${nx}, dx=${dx}`, () => {
                                                beforeEach(async () => {
                                                    const { liquidity } = await poolCollection.poolData(token.address);

                                                    await poolCollection.setAverageRateT(token.address, {
                                                        blockNumber: 1,
                                                        rate: {
                                                            n: liquidity.bntTradingLiquidity.mul(nf),
                                                            d: liquidity.baseTokenTradingLiquidity.mul(df)
                                                        }
                                                    });
                                                });

                                                it(`withdrawal should ${ok ? 'complete' : 'revert'}`, async () => {
                                                    if (ok) {
                                                        await testMultipleWithdrawals(TradingLiquidityState.Update);
                                                    } else {
                                                        await expect(
                                                            withdrawAndVerifyState(
                                                                totalBasePoolTokenAmount,
                                                                withdrawalFeePPM,
                                                                TradingLiquidityState.Update
                                                            )
                                                        ).to.be.revertedWith('RateUnstable');
                                                    }
                                                });
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    );

                    context(
                        'when the matched target network liquidity is below the minimum liquidity for trading',
                        () => {
                            beforeEach(async () => {
                                await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                            });

                            it('should withdraw and reset the trading liquidity', async () => {
                                await testMultipleWithdrawals(TradingLiquidityState.Reset);
                            });
                        }
                    );

                    context('after disabling trading', () => {
                        beforeEach(async () => {
                            await poolCollection.disableTrading(token.address);
                        });

                        it('should withdraw', async () => {
                            await testMultipleWithdrawals(TradingLiquidityState.Update);
                        });

                        context(
                            'when the matched target network liquidity is below the minimum liquidity for trading',
                            () => {
                                beforeEach(async () => {
                                    await networkSettings.setMinLiquidityForTrading(MAX_UINT256);
                                });

                                it('should withdraw and reset the trading liquidity', async () => {
                                    await testMultipleWithdrawals(TradingLiquidityState.Reset);
                                });
                            }
                        );
                    });
                });
            });
        };

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            for (const withdrawalFee of [0, 1]) {
                context(`${symbol}, withdrawalFee=${withdrawalFee}%`, () => {
                    testWithdrawal(new TokenData(symbol), toPPM(withdrawalFee));
                });
            }
        }

        const testWithdrawalPermutations = async (
            tokenData: TokenData,
            poolTokenAmount: BigNumber,
            poolTokenTotalSupply: BigNumber,
            bntTradingLiquidity: BigNumber,
            baseTokenTradingLiquidity: BigNumber,
            stakedBalance: BigNumber,
            balanceOfMasterVault: BigNumber,
            balanceOfExternalProtectionVault: BigNumber,
            tradingFeePPM: number,
            withdrawalFeePPM: number,
            tradingLiquidityState = TradingLiquidityState.Update
        ) => {
            ({ network, bnt, networkSettings, masterVault, externalProtectionVault, bntPool, poolCollection } =
                await createSystem());

            token = await createToken(tokenData);

            poolToken = await createPool(token, network, networkSettings, poolCollection);

            await networkSettings.setWithdrawalFeePPM(withdrawalFeePPM);
            await networkSettings.setMinLiquidityForTrading(0);
            await networkSettings.setFundingLimit(token.address, MAX_UINT256.div(2));

            const blockNumber = await latestBlockNumber();

            await poolCollection.setTradingFeePPM(token.address, tradingFeePPM);
            await poolCollection.setDepositLimit(token.address, MAX_UINT256);
            await poolCollection.setTradingLiquidityT(token.address, {
                bntTradingLiquidity,
                baseTokenTradingLiquidity,
                stakedBalance
            });
            await poolCollection.requestFundingT(CONTEXT_ID, token.address, bntTradingLiquidity);
            await poolCollection.mintPoolTokenT(token.address, provider.address, poolTokenTotalSupply);
            await poolCollection.setBlockNumber(blockNumber);
            await poolCollection.setAverageRateT(token.address, {
                blockNumber,
                rate: { n: bntTradingLiquidity, d: baseTokenTradingLiquidity }
            });

            await transfer(deployer, token, masterVault, balanceOfMasterVault);
            await transfer(deployer, token, externalProtectionVault, balanceOfExternalProtectionVault);
            await network.depositToPoolCollectionForT(
                poolCollection.address,
                CONTEXT_ID,
                provider.address,
                token.address,
                baseTokenTradingLiquidity
            );

            await poolCollection.enableTrading(token.address, bntTradingLiquidity, baseTokenTradingLiquidity);

            if (tradingLiquidityState === TradingLiquidityState.Reset) {
                await networkSettings.setMinLiquidityForTrading(bntTradingLiquidity.mul(2));
            }

            await withdrawAndVerifyState(poolTokenAmount, withdrawalFeePPM, tradingLiquidityState);
        };

        describe('quick withdrawal test', async () => {
            it('BNT - mint for provider, renounce from protocol; TKN - transfer from MV and from EPV to provider', async () => {
                await testWithdrawalPermutations(
                    new TokenData(TokenSymbol.TKN),
                    toWei(1),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1).div(10),
                    toPPM(1),
                    toPPM(1)
                );
            });

            it('BNT - mint for provider, renounce all from protocol; TKN - transfer from MV and from EPV to provider', async () => {
                await testWithdrawalPermutations(
                    new TokenData(TokenSymbol.TKN),
                    toWei(1),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1).div(10),
                    toPPM(1),
                    toPPM(1),
                    TradingLiquidityState.Reset
                );
            });

            it('BNT - mint for MV; TKN - transfer from MV to provider', async () => {
                await testWithdrawalPermutations(
                    new TokenData(TokenSymbol.TKN),
                    toWei(1),
                    toWei(1000),
                    toWei(1000),
                    toWei(100),
                    toWei(1000),
                    toWei(1000),
                    toWei(1).div(10),
                    toPPM(1),
                    toPPM(1)
                );
            });

            it('BNT - renounce from protocol; TKN - transfer from MV and from EPV to provider', async () => {
                await testWithdrawalPermutations(
                    new TokenData(TokenSymbol.TKN),
                    toWei(1).div(10),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toPPM(1),
                    toPPM(1)
                );
            });

            it('BNT - renounce all from protocol; TKN - transfer from MV and from EPV to provider', async () => {
                await testWithdrawalPermutations(
                    new TokenData(TokenSymbol.TKN),
                    toWei(1).div(10),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toWei(1000),
                    toPPM(1),
                    toPPM(1),
                    TradingLiquidityState.Reset
                );
            });

            it('BNT - mint for MV; TKN - transfer from MV to provider', async () => {
                await testWithdrawalPermutations(
                    new TokenData(TokenSymbol.TKN),
                    toWei(new Decimal('4')),
                    toWei(new Decimal('478.997563393863')),
                    toWei(new Decimal('74500.81896317')),
                    toWei(new Decimal('53.729912946654')),
                    toWei(new Decimal('479.034055294121')),
                    toWei(new Decimal('474.412365076241')),
                    toWei(new Decimal('0')),
                    toPPM(0.2),
                    toPPM(0.25)
                );
            });
        });

        for (const symbol of [TokenSymbol.ETH, TokenSymbol.TKN]) {
            for (const poolTokenAmount of [1, 12_345]) {
                for (const poolTokenTotalSupply of [poolTokenAmount * 1_234_567]) {
                    for (const bntTradingLiquidity of [1_234, 1_234_567]) {
                        for (const baseTokenTradingLiquidity of [1_234, 1_234_567]) {
                            for (const stakedBalance of [1_234, 1_234_567]) {
                                for (const balanceOfMasterVault of [
                                    baseTokenTradingLiquidity,
                                    baseTokenTradingLiquidity * 1_234
                                ]) {
                                    for (const balanceOfExternalProtectionVault of [0, 1_234_567]) {
                                        for (const tradingFee of [1]) {
                                            for (const withdrawalFee of [0.1]) {
                                                it(
                                                    '@stress withdrawal test (' +
                                                        [
                                                            `${symbol}`,
                                                            `poolTokenAmount=${poolTokenAmount}`,
                                                            `poolTokenTotalSupply=${poolTokenTotalSupply}`,
                                                            `bntTradingLiquidity=${bntTradingLiquidity}`,
                                                            `baseTokenTradingLiquidity=${baseTokenTradingLiquidity}`,
                                                            `stakedBalance=${stakedBalance}`,
                                                            `balanceOfMasterVault=${balanceOfMasterVault}`,
                                                            `balanceOfExternalProtectionVault=${balanceOfExternalProtectionVault}`,
                                                            `tradingFee=${tradingFee}%`,
                                                            `withdrawalFee=${withdrawalFee}%`
                                                        ].join(', ') +
                                                        ')',
                                                    async () => {
                                                        await testWithdrawalPermutations(
                                                            new TokenData(symbol),
                                                            toWei(poolTokenAmount),
                                                            toWei(poolTokenTotalSupply),
                                                            toWei(bntTradingLiquidity),
                                                            toWei(baseTokenTradingLiquidity),
                                                            toWei(stakedBalance),
                                                            toWei(balanceOfMasterVault),
                                                            toWei(balanceOfExternalProtectionVault),
                                                            toPPM(tradingFee),
                                                            toPPM(withdrawalFee)
                                                        );
                                                    }
                                                );
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    describe('trading', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let bntPool: BNTPool;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const MIN_RETURN_AMOUNT = 1;
        const MAX_SOURCE_AMOUNT = MAX_UINT256;

        beforeEach(async () => {
            ({ network, bnt, networkSettings, bntPool, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            reserveToken = await createTestToken();

            await createPool(reserveToken, network, networkSettings, poolCollection);

            await networkSettings.setFundingLimit(reserveToken.address, MAX_UINT256);

            await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);

            await poolCollection.setBlockNumber(await latestBlockNumber());
        });

        const testTrading = (isSourceBNT: boolean) => {
            const setTradingLiquidity = async (
                bntTradingLiquidity: BigNumberish,
                baseTokenTradingLiquidity: BigNumberish
            ) =>
                poolCollection.setTradingLiquidityT(reserveToken.address, {
                    bntTradingLiquidity,
                    baseTokenTradingLiquidity,
                    stakedBalance: baseTokenTradingLiquidity
                });

            const fromTokenName = isSourceBNT ? 'BNT' : 'base token';
            const toTokenName = isSourceBNT ? 'base token' : 'BNT';

            context(`from ${fromTokenName} to ${toTokenName}`, () => {
                let sourceToken: IERC20;
                let targetToken: IERC20;

                beforeEach(async () => {
                    sourceToken = isSourceBNT ? bnt : reserveToken;
                    targetToken = isSourceBNT ? reserveToken : bnt;
                });

                context('when trading is disabled', () => {
                    beforeEach(async () => {
                        await poolCollection.disableTrading(reserveToken.address);
                    });

                    it('should revert when attempting to trade or query', async () => {
                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('TradingDisabled');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                1,
                                MAX_SOURCE_AMOUNT
                            )
                        ).to.be.revertedWith('TradingDisabled');

                        await expect(
                            poolCollection.tradeOutputAndFeeBySourceAmount(sourceToken.address, targetToken.address, 1)
                        ).to.be.revertedWith('TradingDisabled');

                        await expect(
                            poolCollection.tradeInputAndFeeByTargetAmount(sourceToken.address, targetToken.address, 1)
                        ).to.be.revertedWith('TradingDisabled');
                    });
                });

                context('when trading is enabled', () => {
                    const INITIAL_LIQUIDITY = MIN_LIQUIDITY_FOR_TRADING.mul(BASE_TOKEN_VIRTUAL_BALANCE)
                        .div(BNT_VIRTUAL_BALANCE)
                        .mul(10_000);

                    beforeEach(async () => {
                        await depositToPool(deployer, reserveToken, INITIAL_LIQUIDITY, network);

                        await poolCollection.enableTrading(
                            reserveToken.address,
                            BNT_VIRTUAL_BALANCE,
                            BASE_TOKEN_VIRTUAL_BALANCE
                        );
                    });

                    it('should revert when attempting to trade from a non-network', async () => {
                        const nonNetwork = deployer;

                        await expect(
                            poolCollection
                                .connect(nonNetwork)
                                .tradeBySourceAmount(
                                    CONTEXT_ID,
                                    sourceToken.address,
                                    targetToken.address,
                                    1,
                                    MIN_RETURN_AMOUNT
                                )
                        ).to.be.revertedWith('AccessDenied');

                        await expect(
                            poolCollection
                                .connect(nonNetwork)
                                .tradeByTargetAmount(
                                    CONTEXT_ID,
                                    sourceToken.address,
                                    targetToken.address,
                                    1,
                                    MAX_SOURCE_AMOUNT
                                )
                        ).to.be.revertedWith('AccessDenied');
                    });

                    it('should revert when attempting to trade or query using an invalid source token', async () => {
                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                ZERO_ADDRESS,
                                targetToken.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                ZERO_ADDRESS,
                                targetToken.address,
                                1,
                                MAX_SOURCE_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeOutputAndFeeBySourceAmount(ZERO_ADDRESS, targetToken.address, 1)
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeInputAndFeeByTargetAmount(ZERO_ADDRESS, targetToken.address, 1)
                        ).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to trade or query using an invalid target token', async () => {
                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                ZERO_ADDRESS,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                ZERO_ADDRESS,
                                1,
                                MAX_SOURCE_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeOutputAndFeeBySourceAmount(sourceToken.address, ZERO_ADDRESS, 1)
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeInputAndFeeByTargetAmount(sourceToken.address, ZERO_ADDRESS, 1)
                        ).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to trade or query using a non-existing source token', async () => {
                        const reserveToken2 = await createTestToken();

                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                reserveToken2.address,
                                bnt.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                reserveToken2.address,
                                bnt.address,
                                1,
                                MAX_SOURCE_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeOutputAndFeeBySourceAmount(reserveToken2.address, bnt.address, 1)
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeInputAndFeeByTargetAmount(reserveToken2.address, bnt.address, 1)
                        ).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to trade or query using a non-existing target token', async () => {
                        const reserveToken2 = await createTestToken();

                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                bnt.address,
                                reserveToken2.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                bnt.address,
                                reserveToken2.address,
                                1,
                                MAX_SOURCE_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeOutputAndFeeBySourceAmount(bnt.address, reserveToken2.address, 1)
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeInputAndFeeByTargetAmount(bnt.address, reserveToken2.address, 1)
                        ).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to trade or query without using BNT as one of the tokens', async () => {
                        const reserveToken2 = await createTestToken();

                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                reserveToken.address,
                                reserveToken2.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                reserveToken.address,
                                reserveToken2.address,
                                1,
                                MAX_SOURCE_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeOutputAndFeeBySourceAmount(
                                reserveToken.address,
                                reserveToken2.address,
                                1
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeInputAndFeeByTargetAmount(
                                reserveToken.address,
                                reserveToken2.address,
                                1
                            )
                        ).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to trade or query using BNT as both of the pools', async () => {
                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                bnt.address,
                                bnt.address,
                                1,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                bnt.address,
                                bnt.address,
                                1,
                                MAX_SOURCE_AMOUNT
                            )
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeOutputAndFeeBySourceAmount(bnt.address, bnt.address, 1)
                        ).to.be.revertedWith('DoesNotExist');

                        await expect(
                            poolCollection.tradeInputAndFeeByTargetAmount(bnt.address, bnt.address, 1)
                        ).to.be.revertedWith('DoesNotExist');
                    });

                    it('should revert when attempting to trade or query with an invalid amount', async () => {
                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                0,
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('ZeroValue');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                0,
                                MAX_SOURCE_AMOUNT
                            )
                        ).to.be.revertedWith('ZeroValue');

                        await expect(
                            poolCollection.tradeOutputAndFeeBySourceAmount(sourceToken.address, targetToken.address, 0)
                        ).to.be.revertedWith('ZeroValue');

                        await expect(
                            poolCollection.tradeInputAndFeeByTargetAmount(sourceToken.address, targetToken.address, 0)
                        ).to.be.revertedWith('ZeroValue');
                    });

                    it('should revert when attempting to trade with an invalid minimum/maximum return/source amount', async () => {
                        await expect(
                            network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                1,
                                0
                            )
                        ).to.be.revertedWith('ZeroValue');

                        await expect(
                            network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                1,
                                0
                            )
                        ).to.be.revertedWith('ZeroValue');
                    });

                    context('with sufficient BNT liquidity', () => {
                        beforeEach(async () => {
                            await setTradingLiquidity(MIN_LIQUIDITY_FOR_TRADING, 0);
                        });

                        context('with sufficient target and source token balances', () => {
                            beforeEach(async () => {
                                const bntTradingLiquidity = MIN_LIQUIDITY_FOR_TRADING.mul(1000);

                                // for the tests below, ensure that the source to target ratio above 1, such that a zero
                                // trading result is possible
                                const baseTokenTradingLiquidity = isSourceBNT
                                    ? bntTradingLiquidity.div(2)
                                    : bntTradingLiquidity.mul(2);

                                await setTradingLiquidity(bntTradingLiquidity, baseTokenTradingLiquidity);
                            });

                            it('should revert when the result of a trade by providing the source amount is below the minimum return', async () => {
                                await expect(
                                    network.tradeBySourcePoolCollectionT(
                                        poolCollection.address,
                                        CONTEXT_ID,
                                        sourceToken.address,
                                        targetToken.address,
                                        1,
                                        MAX_UINT256
                                    )
                                ).to.be.revertedWith('InsufficientTargetAmount');
                            });

                            it('should revert when a trade by providing the target amount requires more tokens than provided', async () => {
                                await expect(
                                    network.tradeByTargetPoolCollectionT(
                                        poolCollection.address,
                                        CONTEXT_ID,
                                        sourceToken.address,
                                        targetToken.address,
                                        toWei(100_000),
                                        1
                                    )
                                ).to.be.revertedWith('InsufficientSourceAmount');
                            });
                        });
                    });

                    context('when BNT liquidity falls below the minimum liquidity for trading', () => {
                        beforeEach(async () => {
                            // increase BNT liquidity by the growth factor a few times
                            for (let i = 0; i < 5; i++) {
                                await depositToPool(deployer, reserveToken, 1, network);
                            }

                            const { liquidity: prevLiquidity } = await poolCollection.poolData(reserveToken.address);

                            const targetBNTLiquidity = MIN_LIQUIDITY_FOR_TRADING.div(4);
                            const bntTradeAmountToTrade = prevLiquidity.bntTradingLiquidity.sub(targetBNTLiquidity);

                            // trade enough BNT out such that the total BNT liquidity for trading falls bellow the
                            // minimum liquidity for trading
                            const { amount } = await poolCollection.tradeInputAndFeeByTargetAmount(
                                reserveToken.address,
                                bnt.address,
                                bntTradeAmountToTrade
                            );

                            // we will use the "full trade" function since we must to ensure that the tokens will also
                            // leave the master vault
                            await reserveToken.connect(deployer).approve(network.address, amount);
                            await network.tradeBySourceAmount(
                                reserveToken.address,
                                bnt.address,
                                amount,
                                MIN_RETURN_AMOUNT,
                                MAX_UINT256,
                                deployer.address
                            );

                            const { liquidity } = await poolCollection.poolData(reserveToken.address);

                            await poolCollection.setAverageRateT(reserveToken.address, {
                                blockNumber: await poolCollection.currentBlockNumber(),
                                rate: {
                                    n: liquidity.bntTradingLiquidity,
                                    d: liquidity.baseTokenTradingLiquidity
                                }
                            });

                            expect(liquidity.bntTradingLiquidity).lt(MIN_LIQUIDITY_FOR_TRADING);
                        });

                        it('should allow trading by providing the source amount', async () => {
                            const res = await network.tradeBySourcePoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                toWei(1),
                                MIN_RETURN_AMOUNT
                            );

                            await expect(res).to.emit(poolCollection, 'TradingLiquidityUpdated');
                        });

                        it('should allow trading by providing the target amount', async () => {
                            const res = await network.tradeByTargetPoolCollectionT(
                                poolCollection.address,
                                CONTEXT_ID,
                                sourceToken.address,
                                targetToken.address,
                                toWei(1),
                                MAX_SOURCE_AMOUNT
                            );

                            await expect(res).to.emit(poolCollection, 'TradingLiquidityUpdated');
                        });

                        it('should disable trading when withdrawing', async () => {
                            const { liquidity: prevLiquidity } = await poolCollection.poolData(reserveToken.address);
                            const prevFunding = await bntPool.currentPoolFunding(reserveToken.address);
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
                                bntPool,
                                true,
                                res,
                                newStakedBalance,
                                prevFunding.sub(
                                    withdrawalAmounts.newBNTTradingLiquidity.add(
                                        withdrawalAmounts.bntProtocolHoldingsDelta.value
                                    )
                                ),
                                TradingStatusUpdateReason.MinLiquidity
                            );
                        });

                        it('should disable trading when depositing', async () => {
                            const { liquidity: prevLiquidity } = await poolCollection.poolData(reserveToken.address);
                            const prevFunding = await bntPool.currentPoolFunding(reserveToken.address);

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
                                bntPool,
                                true,
                                res,
                                prevLiquidity.stakedBalance.add(amount),
                                prevFunding.sub(prevLiquidity.bntTradingLiquidity),
                                TradingStatusUpdateReason.MinLiquidity
                            );
                        });
                    });

                    context('with insufficient pool balances', () => {
                        beforeEach(async () => {
                            await networkSettings.setMinLiquidityForTrading(0);
                        });

                        context('source token', () => {
                            const amount = BigNumber.from(12_345);

                            context('empty', () => {
                                beforeEach(async () => {
                                    const targetBalance = amount.mul(999_999_999_999);
                                    const bntTradingLiquidity = isSourceBNT ? BigNumber.from(0) : targetBalance;
                                    const baseTokenTradingLiquidity = isSourceBNT ? targetBalance : BigNumber.from(0);
                                    await setTradingLiquidity(bntTradingLiquidity, baseTokenTradingLiquidity);
                                });

                                it('should revert when attempting to trade or query', async () => {
                                    await expect(
                                        network.tradeBySourcePoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MIN_RETURN_AMOUNT
                                        )
                                    ).to.be.revertedWith('InsufficientLiquidity');

                                    await expect(
                                        network.tradeByTargetPoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MAX_SOURCE_AMOUNT
                                        )
                                    ).to.be.revertedWith('InsufficientLiquidity');

                                    await expect(
                                        poolCollection.tradeOutputAndFeeBySourceAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            amount
                                        )
                                    ).to.be.revertedWith('InsufficientLiquidity');

                                    await expect(
                                        poolCollection.tradeInputAndFeeByTargetAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            amount
                                        )
                                    ).to.be.revertedWith('InsufficientLiquidity');
                                });
                            });
                        });

                        context('target token', () => {
                            context('empty', () => {
                                const amount = 12_345;

                                beforeEach(async () => {
                                    const sourceBalance = BigNumber.from(12_345);
                                    const bntTradingLiquidity = isSourceBNT ? sourceBalance : BigNumber.from(0);

                                    const baseTokenTradingLiquidity = isSourceBNT ? BigNumber.from(0) : sourceBalance;

                                    await setTradingLiquidity(bntTradingLiquidity, baseTokenTradingLiquidity);
                                });

                                it('should revert when attempting to trade or query', async () => {
                                    await expect(
                                        network.tradeBySourcePoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MIN_RETURN_AMOUNT
                                        )
                                    ).to.be.revertedWith('InsufficientLiquidity');

                                    // TODO: test for the exact revert reason once the issue with ethers is fixed
                                    // error: revertedWith('reverted with panic code 0x11')
                                    await expect(
                                        network.tradeByTargetPoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MAX_SOURCE_AMOUNT
                                        )
                                    ).to.be.reverted;

                                    await expect(
                                        poolCollection.tradeOutputAndFeeBySourceAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            amount
                                        )
                                    ).to.be.revertedWith('InsufficientLiquidity');

                                    // TODO: test for the exact revert reason once the issue with ethers is fixed
                                    // error: revertedWith('reverted with panic code 0x11')
                                    await expect(
                                        poolCollection.tradeInputAndFeeByTargetAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            amount
                                        )
                                    ).to.be.reverted;
                                });
                            });

                            context('insufficient', () => {
                                const bntTradingLiquidity = BigNumber.from(12_345);
                                const baseTokenTradingLiquidity = BigNumber.from(9_999_999);

                                const targetBalance = isSourceBNT ? baseTokenTradingLiquidity : bntTradingLiquidity;

                                let targetAmount: BigNumber;

                                beforeEach(async () => {
                                    await setTradingLiquidity(bntTradingLiquidity, baseTokenTradingLiquidity);

                                    targetAmount = targetBalance;
                                });

                                it('should revert when attempting to query the source amount', async () => {
                                    // TODO: test for the exact revert reason once the issue with ethers is fixed
                                    // error: revertedWith('reverted with panic code 0x11')
                                    await expect(
                                        poolCollection.tradeInputAndFeeByTargetAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            targetAmount
                                        )
                                    ).to.be.reverted;
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

                                        // note that due to the integer-division, we expect:
                                        // - `targetAmount + feeAmount` to be slightly smaller than `targetBalance`
                                        // - `targetAmount + feeAmount + 1` to be equal to or larger than `targetBalance`
                                    });

                                    it('should not revert when attempting to query the source amount', async () => {
                                        await poolCollection.tradeInputAndFeeByTargetAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            targetAmount
                                        );
                                    });

                                    it('should revert when attempting to query the source amount', async () => {
                                        // TODO: test for the exact revert reason once the issue with ethers is fixed
                                        // error: either division by zero or subtraction underflow
                                        await expect(
                                            poolCollection.tradeInputAndFeeByTargetAmount(
                                                sourceToken.address,
                                                targetToken.address,
                                                targetAmount.add(1)
                                            )
                                        ).to.be.reverted;
                                    });
                                });
                            });
                        });
                    });

                    interface Spec {
                        sourceBalance: BigNumber;
                        targetBalance: BigNumber;
                        tradingFeePPM: number;
                        networkFeePPM: number;
                        amount: BigNumber;
                        blockNumbers: number[];
                    }

                    const testTrading = (spec: Spec) => {
                        const { sourceBalance, targetBalance, tradingFeePPM, networkFeePPM, amount, blockNumbers } =
                            spec;

                        context(
                            `with (${[
                                sourceBalance,
                                targetBalance,
                                tradingFeePPM,
                                networkFeePPM,
                                amount
                            ]}) [${blockNumbers}]`,
                            () => {
                                type PoolData = AsyncReturnType<TestPoolCollection['poolData']>;
                                const expectedAverageRate = (poolData: PoolData, blockNumber: number) => {
                                    if (blockNumber !== poolData.averageRate.blockNumber) {
                                        const averageRate = poolData.averageRate.rate;
                                        const spotRate = {
                                            n: poolData.liquidity.bntTradingLiquidity,
                                            d: poolData.liquidity.baseTokenTradingLiquidity
                                        };
                                        const newAverageRate = {
                                            n: averageRate.n
                                                .mul(spotRate.d)
                                                .mul(EMA_AVERAGE_RATE_WEIGHT)
                                                .add(averageRate.d.mul(spotRate.n).mul(EMA_SPOT_RATE_WEIGHT)),
                                            d: averageRate.d
                                                .mul(spotRate.d)
                                                .mul(EMA_AVERAGE_RATE_WEIGHT + EMA_SPOT_RATE_WEIGHT)
                                        };
                                        const scale = max(newAverageRate.n, newAverageRate.d)
                                            .sub(1)
                                            .div(BigNumber.from(2).pow(112).sub(1))
                                            .add(1);
                                        return {
                                            blockNumber,
                                            rate: { n: newAverageRate.n.div(scale), d: newAverageRate.d.div(scale) }
                                        };
                                    }
                                    return poolData.averageRate;
                                };

                                const expectedNetworkFeeAmount = (
                                    targetNetworkFeeAmount: BigNumber,
                                    bntTradingLiquidity: BigNumber,
                                    baseTokenTradingLiquidity: BigNumber
                                ) => {
                                    if (isSourceBNT) {
                                        return {
                                            bntFeeAmount: expectedTargetAmountAndFee(
                                                targetNetworkFeeAmount,
                                                0,
                                                baseTokenTradingLiquidity,
                                                bntTradingLiquidity
                                            ).amount,
                                            targetNetworkFeeAmount
                                        };
                                    }

                                    return { bntFeeAmount: targetNetworkFeeAmount, targetNetworkFeeAmount: 0 };
                                };

                                const expectedTargetAmountAndFee = (
                                    sourceAmount: BigNumber,
                                    tradingFeePPM: number,
                                    sourceTokenBalance: BigNumber,
                                    targetTokenBalance: BigNumber
                                ) => {
                                    const amount = targetTokenBalance
                                        .mul(sourceAmount)
                                        .div(sourceTokenBalance.add(sourceAmount).toString());
                                    const tradingFeeAmount = amount.mul(tradingFeePPM).div(PPM_RESOLUTION);

                                    return { amount: amount.sub(tradingFeeAmount), tradingFeeAmount };
                                };

                                const expectedSourceAmountAndFee = (
                                    targetAmount: BigNumber,
                                    tradingFeePPM: number,
                                    sourceTokenBalance: BigNumber,
                                    targetTokenBalance: BigNumber
                                ) => {
                                    const tradingFeeAmount = targetAmount
                                        .mul(tradingFeePPM)
                                        .div(PPM_RESOLUTION - tradingFeePPM);
                                    const fullTargetAmount = targetAmount.add(tradingFeeAmount);
                                    const sourceAmount = sourceTokenBalance
                                        .mul(fullTargetAmount)
                                        .div(targetTokenBalance.sub(fullTargetAmount));

                                    return { amount: sourceAmount, tradingFeeAmount };
                                };

                                beforeEach(async () => {
                                    await networkSettings.setNetworkFeePPM(networkFeePPM);

                                    const bntTradingLiquidity = isSourceBNT ? sourceBalance : targetBalance;
                                    const baseTokenTradingLiquidity = isSourceBNT ? targetBalance : sourceBalance;
                                    await setTradingLiquidity(bntTradingLiquidity, baseTokenTradingLiquidity);

                                    await poolCollection.setAverageRateT(reserveToken.address, {
                                        blockNumber: 0,
                                        rate: { n: bntTradingLiquidity, d: baseTokenTradingLiquidity }
                                    });

                                    await poolCollection.setTradingFeePPM(reserveToken.address, tradingFeePPM);
                                });

                                it('should perform a trade by providing the source amount', async () => {
                                    for (const blockNumber of blockNumbers) {
                                        await poolCollection.setBlockNumber(blockNumber);

                                        const prevPoolData = await poolCollection.poolData(reserveToken.address);
                                        const { liquidity: prevLiquidity } = prevPoolData;

                                        const targetAmountAndFee = await poolCollection.tradeOutputAndFeeBySourceAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            amount
                                        );

                                        const sourceAmountAndFee = await poolCollection.tradeInputAndFeeByTargetAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            targetAmountAndFee.amount
                                        );

                                        const tradeAmounts = await network.callStatic.tradeBySourcePoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MIN_RETURN_AMOUNT
                                        );

                                        const res = await network.tradeBySourcePoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MIN_RETURN_AMOUNT
                                        );

                                        const expectedTargetAmounts = expectedTargetAmountAndFee(
                                            amount,
                                            tradingFeePPM,
                                            isSourceBNT
                                                ? prevLiquidity.bntTradingLiquidity
                                                : prevLiquidity.baseTokenTradingLiquidity,
                                            isSourceBNT
                                                ? prevLiquidity.baseTokenTradingLiquidity
                                                : prevLiquidity.bntTradingLiquidity
                                        );

                                        let newBNTTradingLiquidity = prevLiquidity.bntTradingLiquidity;
                                        let newBaseTokenTradingLiquidity = prevLiquidity.baseTokenTradingLiquidity;
                                        if (isSourceBNT) {
                                            newBNTTradingLiquidity = newBNTTradingLiquidity.add(amount);
                                            newBaseTokenTradingLiquidity = newBaseTokenTradingLiquidity.sub(
                                                expectedTargetAmounts.amount
                                            );
                                        } else {
                                            newBNTTradingLiquidity = newBNTTradingLiquidity.sub(
                                                expectedTargetAmounts.amount
                                            );
                                            newBaseTokenTradingLiquidity = newBaseTokenTradingLiquidity.add(amount);
                                        }

                                        const targetNetworkFeeAmount = expectedTargetAmounts.tradingFeeAmount
                                            .mul(networkFeePPM)
                                            .div(PPM_RESOLUTION);

                                        if (isSourceBNT) {
                                            newBaseTokenTradingLiquidity =
                                                newBaseTokenTradingLiquidity.sub(targetNetworkFeeAmount);
                                        } else {
                                            newBNTTradingLiquidity = newBNTTradingLiquidity.sub(targetNetworkFeeAmount);
                                        }

                                        const expectedNetworkFees = expectedNetworkFeeAmount(
                                            targetNetworkFeeAmount,
                                            newBNTTradingLiquidity,
                                            newBaseTokenTradingLiquidity
                                        );

                                        expect(targetAmountAndFee.amount).to.almostEqual(expectedTargetAmounts.amount, {
                                            maxRelativeError: new Decimal('0.0000000000000000001')
                                        });
                                        expect(targetAmountAndFee.tradingFeeAmount).to.almostEqual(
                                            expectedTargetAmounts.tradingFeeAmount,
                                            {
                                                maxRelativeError: new Decimal('0.000000000000000006'),
                                                relation: Relation.LesserOrEqual
                                            }
                                        );

                                        expect(sourceAmountAndFee.amount).to.almostEqual(amount, {
                                            maxRelativeError: new Decimal('0.0000000000000000001')
                                        });
                                        expect(sourceAmountAndFee.tradingFeeAmount).to.almostEqual(
                                            targetAmountAndFee.tradingFeeAmount,
                                            {
                                                maxRelativeError: new Decimal('0.000000000000000002'),
                                                relation: Relation.GreaterOrEqual
                                            }
                                        );

                                        expect(tradeAmounts.amount).to.equal(targetAmountAndFee.amount);
                                        expect(tradeAmounts.tradingFeeAmount).to.equal(
                                            targetAmountAndFee.tradingFeeAmount
                                        );
                                        expect(tradeAmounts.networkFeeAmount).to.equal(
                                            expectedNetworkFees.bntFeeAmount
                                        );

                                        const poolData = await poolCollection.poolData(reserveToken.address);
                                        const { liquidity } = poolData;

                                        await expect(res)
                                            .to.emit(poolCollection, 'TradingLiquidityUpdated')
                                            .withArgs(
                                                CONTEXT_ID,
                                                reserveToken.address,
                                                bnt.address,
                                                prevLiquidity.bntTradingLiquidity,
                                                liquidity.bntTradingLiquidity
                                            );

                                        await expect(res)
                                            .to.emit(poolCollection, 'TradingLiquidityUpdated')
                                            .withArgs(
                                                CONTEXT_ID,
                                                reserveToken.address,
                                                reserveToken.address,
                                                prevLiquidity.baseTokenTradingLiquidity,
                                                liquidity.baseTokenTradingLiquidity
                                            );

                                        await expect(res).not.to.emit(poolCollection, 'TotalLiquidityUpdated');

                                        if (isSourceBNT) {
                                            expect(liquidity.bntTradingLiquidity).to.equal(
                                                newBNTTradingLiquidity.sub(expectedNetworkFees.bntFeeAmount)
                                            );
                                            expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                                newBaseTokenTradingLiquidity.add(
                                                    expectedNetworkFees.targetNetworkFeeAmount
                                                )
                                            );
                                            expect(liquidity.stakedBalance).to.equal(
                                                prevLiquidity.stakedBalance
                                                    .add(expectedTargetAmounts.tradingFeeAmount)
                                                    .sub(expectedNetworkFees.targetNetworkFeeAmount)
                                            );
                                        } else {
                                            expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                                newBaseTokenTradingLiquidity
                                            );
                                            expect(liquidity.bntTradingLiquidity).to.equal(newBNTTradingLiquidity);
                                        }

                                        // verify that the average rate has been updated
                                        const expectedNewAverageRate = await expectedAverageRate(
                                            prevPoolData,
                                            blockNumber
                                        );
                                        expect(poolData.averageRate.blockNumber).to.equal(
                                            expectedNewAverageRate.blockNumber
                                        );
                                        expect(poolData.averageRate.rate).to.equal(expectedNewAverageRate.rate);
                                    }
                                });

                                it('should perform a trade by providing the target amount', async () => {
                                    for (const blockNumber of blockNumbers) {
                                        await poolCollection.setBlockNumber(blockNumber);

                                        const prevPoolData = await poolCollection.poolData(reserveToken.address);
                                        const { liquidity: prevLiquidity } = prevPoolData;

                                        const sourceAmountAndFee = await poolCollection.tradeInputAndFeeByTargetAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            amount
                                        );

                                        const targetAmountAndFee = await poolCollection.tradeOutputAndFeeBySourceAmount(
                                            sourceToken.address,
                                            targetToken.address,
                                            sourceAmountAndFee.amount
                                        );

                                        const tradeAmounts = await network.callStatic.tradeByTargetPoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MAX_SOURCE_AMOUNT
                                        );

                                        const res = await network.tradeByTargetPoolCollectionT(
                                            poolCollection.address,
                                            CONTEXT_ID,
                                            sourceToken.address,
                                            targetToken.address,
                                            amount,
                                            MAX_SOURCE_AMOUNT
                                        );

                                        const expectedSourceAmounts = expectedSourceAmountAndFee(
                                            amount,
                                            tradingFeePPM,
                                            isSourceBNT
                                                ? prevLiquidity.bntTradingLiquidity
                                                : prevLiquidity.baseTokenTradingLiquidity,
                                            isSourceBNT
                                                ? prevLiquidity.baseTokenTradingLiquidity
                                                : prevLiquidity.bntTradingLiquidity
                                        );

                                        let newBNTTradingLiquidity = prevLiquidity.bntTradingLiquidity;
                                        let newBaseTokenTradingLiquidity = prevLiquidity.baseTokenTradingLiquidity;
                                        if (isSourceBNT) {
                                            newBNTTradingLiquidity = newBNTTradingLiquidity.add(
                                                expectedSourceAmounts.amount
                                            );
                                            newBaseTokenTradingLiquidity = newBaseTokenTradingLiquidity.sub(amount);
                                        } else {
                                            newBNTTradingLiquidity = newBNTTradingLiquidity.sub(amount);
                                            newBaseTokenTradingLiquidity = newBaseTokenTradingLiquidity.add(
                                                expectedSourceAmounts.amount
                                            );
                                        }

                                        const targetNetworkFeeAmount = expectedSourceAmounts.tradingFeeAmount
                                            .mul(networkFeePPM)
                                            .div(PPM_RESOLUTION);

                                        if (isSourceBNT) {
                                            newBaseTokenTradingLiquidity =
                                                newBaseTokenTradingLiquidity.sub(targetNetworkFeeAmount);
                                        } else {
                                            newBNTTradingLiquidity = newBNTTradingLiquidity.sub(targetNetworkFeeAmount);
                                        }

                                        const expectedNetworkFees = expectedNetworkFeeAmount(
                                            targetNetworkFeeAmount,
                                            newBNTTradingLiquidity,
                                            newBaseTokenTradingLiquidity
                                        );

                                        expect(sourceAmountAndFee.amount).to.almostEqual(expectedSourceAmounts.amount, {
                                            maxRelativeError: new Decimal('0.0000000000000000001')
                                        });
                                        expect(sourceAmountAndFee.tradingFeeAmount).to.almostEqual(
                                            expectedSourceAmounts.tradingFeeAmount,
                                            {
                                                maxRelativeError: new Decimal('0.000000000000000006'),
                                                relation: Relation.LesserOrEqual
                                            }
                                        );

                                        expect(targetAmountAndFee.amount).to.almostEqual(amount, {
                                            maxRelativeError: new Decimal('0.0000000000000000001')
                                        });
                                        expect(targetAmountAndFee.tradingFeeAmount).to.almostEqual(
                                            sourceAmountAndFee.tradingFeeAmount,
                                            {
                                                maxAbsoluteError: new Decimal(1),
                                                maxRelativeError: new Decimal('0.000000000000000002'),
                                                relation: Relation.LesserOrEqual
                                            }
                                        );

                                        expect(tradeAmounts.amount).to.equal(sourceAmountAndFee.amount);
                                        expect(tradeAmounts.tradingFeeAmount).to.equal(
                                            sourceAmountAndFee.tradingFeeAmount
                                        );
                                        expect(tradeAmounts.networkFeeAmount).to.equal(
                                            expectedNetworkFees.bntFeeAmount
                                        );

                                        const poolData = await poolCollection.poolData(reserveToken.address);
                                        const { liquidity } = poolData;

                                        await expect(res)
                                            .to.emit(poolCollection, 'TradingLiquidityUpdated')
                                            .withArgs(
                                                CONTEXT_ID,
                                                reserveToken.address,
                                                bnt.address,
                                                prevLiquidity.bntTradingLiquidity,
                                                liquidity.bntTradingLiquidity
                                            );

                                        await expect(res)
                                            .to.emit(poolCollection, 'TradingLiquidityUpdated')
                                            .withArgs(
                                                CONTEXT_ID,
                                                reserveToken.address,
                                                reserveToken.address,
                                                prevLiquidity.baseTokenTradingLiquidity,
                                                liquidity.baseTokenTradingLiquidity
                                            );

                                        await expect(res).not.to.emit(poolCollection, 'TotalLiquidityUpdated');

                                        if (isSourceBNT) {
                                            expect(liquidity.bntTradingLiquidity).to.equal(
                                                newBNTTradingLiquidity.sub(expectedNetworkFees.bntFeeAmount)
                                            );
                                            expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                                newBaseTokenTradingLiquidity.add(
                                                    expectedNetworkFees.targetNetworkFeeAmount
                                                )
                                            );
                                            expect(liquidity.stakedBalance).to.equal(
                                                prevLiquidity.stakedBalance
                                                    .add(expectedSourceAmounts.tradingFeeAmount)
                                                    .sub(expectedNetworkFees.targetNetworkFeeAmount)
                                            );
                                        } else {
                                            expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                                newBaseTokenTradingLiquidity
                                            );
                                            expect(liquidity.bntTradingLiquidity).to.equal(newBNTTradingLiquidity);
                                        }

                                        // verify that the average rate has been updated
                                        const expectedNewAverageRate = await expectedAverageRate(
                                            prevPoolData,
                                            blockNumber
                                        );
                                        expect(poolData.averageRate.blockNumber).to.equal(
                                            expectedNewAverageRate.blockNumber
                                        );
                                        expect(poolData.averageRate.rate).to.equal(expectedNewAverageRate.rate);
                                    }
                                });
                            }
                        );
                    };

                    describe('regular tests', () => {
                        for (const sourceBalance of [1_000_000]) {
                            for (const targetBalance of [5_000_000]) {
                                for (const tradingFeePercent of [10]) {
                                    for (const networkFeePercent of [20]) {
                                        for (const amount of [1_000]) {
                                            testTrading({
                                                sourceBalance: toWei(sourceBalance),
                                                targetBalance: toWei(targetBalance),
                                                tradingFeePPM: toPPM(tradingFeePercent),
                                                networkFeePPM: toPPM(networkFeePercent),
                                                amount: toWei(amount),
                                                blockNumbers: [0, 200, 500, 500, 600]
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    });

                    describe('@stress tests', () => {
                        for (const sourceBalance of [1_000_000, 100_000_000]) {
                            for (const targetBalance of [1_000_000, 100_000_000]) {
                                for (const tradingFeePercent of [0, 10]) {
                                    for (const networkFeePercent of [0, 20]) {
                                        for (const amount of [1_000, 100_000]) {
                                            testTrading({
                                                sourceBalance: toWei(sourceBalance),
                                                targetBalance: toWei(targetBalance),
                                                tradingFeePPM: toPPM(tradingFeePercent),
                                                networkFeePPM: toPPM(networkFeePercent),
                                                amount: toWei(amount),
                                                blockNumbers: [0, 1, 2, 10, 10, 100, 400]
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    });
                });
            });
        };

        for (const isSourceBNT of [true, false]) {
            testTrading(isSourceBNT);
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

        for (const feeAmount of [0, 12_345]) {
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
        });

        context('initial', () => {
            it('should report initial amounts', async () => {
                expect(await poolCollection.underlyingToPoolToken(reserveToken.address, 1234)).to.equal(1234);
                expect(await poolCollection.poolTokenToUnderlying(reserveToken.address, 5678)).to.equal(5678);
            });
        });

        context('with liquidity', () => {
            beforeEach(async () => {
                await network.depositToPoolCollectionForT(
                    poolCollection.address,
                    CONTEXT_ID,
                    deployer.address,
                    reserveToken.address,
                    BASE_TOKEN_LIQUIDITY
                );
            });

            for (const tokenAmount of [0, 1000, toWei(20_000)]) {
                context(`underlying amount of ${tokenAmount.toString()}`, () => {
                    it('should properly convert between underlying amount and pool token amount', async () => {
                        const poolTokenTotalSupply = await poolToken.totalSupply();
                        const { stakedBalance } = await poolCollection.poolLiquidity(reserveToken.address);

                        const poolTokenAmount = await poolCollection.underlyingToPoolToken(
                            reserveToken.address,
                            tokenAmount
                        );
                        expect(poolTokenAmount).to.equal(
                            // ceil(tokenAmount * poolTokenTotalSupply / stakedBalance)
                            BigNumber.from(tokenAmount)
                                .mul(poolTokenTotalSupply)
                                .add(stakedBalance)
                                .sub(1)
                                .div(stakedBalance)
                        );

                        const underlyingAmount = await poolCollection.poolTokenToUnderlying(
                            reserveToken.address,
                            poolTokenAmount
                        );
                        expect(underlyingAmount).to.equal(tokenAmount);
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
                                // specified BNT amount while taking into account pool tokens owned by the protocol
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
    });

    describe('pool migrations', () => {
        let network: TestBancorNetwork;
        let bnt: IERC20;
        let networkSettings: NetworkSettings;
        let masterVault: MasterVault;
        let externalProtectionVault: ExternalProtectionVault;
        let bntPool: TestBNTPool;
        let poolTokenFactory: PoolTokenFactory;
        let poolCollection: TestPoolCollection;
        let poolToken: PoolToken;
        let targetPoolCollection: TestPoolCollection;
        let poolMigrator: TestPoolMigrator;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({
                network,
                bnt,
                networkSettings,
                masterVault,
                externalProtectionVault,
                bntPool,
                poolTokenFactory,
                poolCollection,
                poolMigrator
            } = await createSystem());

            reserveToken = await createTestToken();

            poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);

            targetPoolCollection = await createPoolCollection(
                network,
                bnt,
                networkSettings,
                masterVault,
                bntPool,
                externalProtectionVault,
                poolTokenFactory,
                poolMigrator,
                (await poolCollection.version()) + 1
            );
            await network.addPoolCollection(targetPoolCollection.address);
            await network.setLatestPoolCollection(targetPoolCollection.address);
        });

        describe('in', () => {
            it('should revert when attempting to migrate a pool into a pool collection from a non-migrator', async () => {
                const nonMigrator = deployer;

                const poolData = await poolCollection.poolData(reserveToken.address);
                await expect(
                    targetPoolCollection.connect(nonMigrator).migratePoolIn(reserveToken.address, poolData)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to migrate an invalid pool into a pool collection', async () => {
                const poolData = await poolCollection.poolData(reserveToken.address);
                await expect(
                    poolMigrator.migratePoolInT(targetPoolCollection.address, ZERO_ADDRESS, poolData)
                ).to.be.revertedWith('InvalidAddress');
            });

            it('should revert when attempting to migrate an already existing pool into a pool collection', async () => {
                const poolData = await poolCollection.poolData(reserveToken.address);
                await expect(
                    poolMigrator.migratePoolInT(poolCollection.address, reserveToken.address, poolData)
                ).to.be.revertedWith('AlreadyExists');
            });

            it('should revert when attempting to migrate a pool that was not migrated out', async () => {
                const poolData = await poolCollection.poolData(reserveToken.address);

                await expect(
                    poolMigrator.migratePoolInT(targetPoolCollection.address, reserveToken.address, poolData)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should allow to migrate a pool into a pool collection', async () => {
                let newPoolData = await targetPoolCollection.poolData(reserveToken.address);
                expect(newPoolData.poolToken).to.equal(ZERO_ADDRESS);

                expect(await poolToken.owner()).to.equal(poolCollection.address);

                const poolData = await poolCollection.poolData(reserveToken.address);

                await poolMigrator.migratePoolOutT(
                    poolCollection.address,
                    reserveToken.address,
                    targetPoolCollection.address
                );

                await poolMigrator.migratePoolInT(targetPoolCollection.address, reserveToken.address, poolData);

                newPoolData = await targetPoolCollection.poolData(reserveToken.address);
                expect(newPoolData).to.deep.equal(poolData);

                expect(await poolToken.owner()).to.equal(targetPoolCollection.address);
            });
        });

        describe('out', () => {
            it('should revert when attempting to migrate a pool out of a pool collection from a non-migrator', async () => {
                const nonMigrator = deployer;

                await expect(
                    poolCollection
                        .connect(nonMigrator)
                        .migratePoolOut(reserveToken.address, targetPoolCollection.address)
                ).to.be.revertedWith('AccessDenied');
            });

            it('should revert when attempting to migrate an invalid pool out of a pool collection', async () => {
                await expect(
                    poolMigrator.migratePoolOutT(poolCollection.address, ZERO_ADDRESS, targetPoolCollection.address)
                ).to.be.revertedWith('DoesNotExist');
            });

            it('should revert when attempting to migrate a pool out of a pool collection to an invalid pool collection', async () => {
                await expect(
                    poolMigrator.migratePoolOutT(poolCollection.address, reserveToken.address, ZERO_ADDRESS)
                ).to.be.revertedWith('InvalidAddress');

                const newPoolCollection = await createPoolCollection(
                    network,
                    bnt,
                    networkSettings,
                    masterVault,
                    bntPool,
                    externalProtectionVault,
                    poolTokenFactory,
                    poolMigrator
                );
                await expect(
                    poolMigrator.migratePoolOutT(
                        poolCollection.address,
                        reserveToken.address,
                        newPoolCollection.address
                    )
                ).to.be.revertedWith('InvalidPoolCollection');
            });

            it('should revert when attempting to migrate a non-existing pool out of a pool collection', async () => {
                const reserveToken2 = await createTestToken();
                await expect(
                    poolMigrator.migratePoolOutT(
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

                await poolMigrator.migratePoolOutT(
                    poolCollection.address,
                    reserveToken.address,
                    targetPoolCollection.address
                );

                poolData = await poolCollection.poolData(reserveToken.address);
                expect(poolData.poolToken).to.equal(ZERO_ADDRESS);

                expect(await poolToken.newOwner()).to.equal(targetPoolCollection.address);
            });
        });
    });
});
