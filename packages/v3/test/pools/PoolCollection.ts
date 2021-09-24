import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import fs from 'fs';
import { ethers } from 'hardhat';
import path from 'path';
import Contracts from '../../components/Contracts';
import {
    NetworkSettings,
    PoolToken,
    TestBancorNetwork,
    TestERC20Token,
    TestPoolCollection,
    TestPoolAverageRate
} from '../../typechain';
import { INVALID_FRACTION, MAX_UINT256, PPM_RESOLUTION, ZERO_ADDRESS, ZERO_FRACTION } from '../helpers/Constants';
import { createPool, createSystem } from '../helpers/Factory';
import { toWei } from '../helpers/Types';
import { createTokenBySymbol, TokenWithAddress } from '../helpers/Utils';

describe('PoolCollection', () => {
    const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
    const POOL_TYPE = BigNumber.from(1);
    const SYMBOL = 'TKN';
    const MIN_LIQUIDITY_FOR_TRADING = toWei(BigNumber.from(1000));
    const INITIAL_RATE = { n: BigNumber.from(1), d: BigNumber.from(2) };

    const TRADING_STATUS_UPDATE_OWNER = 0;
    const TRADING_STATUS_UPDATE_MIN_LIQUIDITY = 1;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when initialized with an invalid network contract', async () => {
            const { poolTokenFactory } = await createSystem();

            await expect(Contracts.PoolCollection.deploy(ZERO_ADDRESS, poolTokenFactory.address)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should revert when initialized with an invalid pool token factory contract', async () => {
            const { network } = await createSystem();

            await expect(Contracts.PoolCollection.deploy(network.address, ZERO_ADDRESS)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should be properly initialized', async () => {
            const { network, networkToken, networkSettings, poolTokenFactory, poolCollection } = await createSystem();

            expect(await poolCollection.version()).to.equal(1);

            expect(await poolCollection.poolType()).to.equal(POOL_TYPE);
            expect(await poolCollection.network()).to.equal(network.address);
            expect(await poolCollection.networkToken()).to.equal(networkToken.address);
            expect(await poolCollection.settings()).to.equal(networkSettings.address);
            expect(await poolCollection.poolTokenFactory()).to.equal(poolTokenFactory.address);
            expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });

        it('should emit events on initialization', async () => {
            const { poolCollection } = await createSystem();

            await expect(poolCollection.deployTransaction)
                .to.emit(poolCollection, 'DefaultTradingFeePPMUpdated')
                .withArgs(BigNumber.from(0), DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('default trading fee', () => {
        const newDefaultTradingFree = BigNumber.from(100000);

        let network: TestBancorNetwork;
        let networkSettings: NetworkSettings;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, poolCollection } = await createSystem());

            expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

            reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
        });

        it('should revert when a non-owner attempts to set the default trading fee', async () => {
            await expect(
                poolCollection.connect(nonOwner).setDefaultTradingFeePPM(newDefaultTradingFree)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting the default trading fee to an invalid value', async () => {
            await expect(
                poolCollection.setDefaultTradingFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))
            ).to.be.revertedWith('ERR_INVALID_FEE');
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
            await networkSettings.addTokenToWhitelist(reserveToken.address);
            await network.createPoolT(poolCollection.address, reserveToken.address);
            const pool = await poolCollection.poolData(reserveToken.address);
            expect(pool.tradingFeePPM).to.equal(newDefaultTradingFree);

            const res2 = await poolCollection.setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
            await expect(res2)
                .to.emit(poolCollection, 'DefaultTradingFeePPMUpdated')
                .withArgs(newDefaultTradingFree, DEFAULT_TRADING_FEE_PPM);

            expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);

            // ensure that the new default trading fee is used during the creation of newer pools
            const newReserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
            await networkSettings.addTokenToWhitelist(newReserveToken.address);
            await network.createPoolT(poolCollection.address, newReserveToken.address);
            const pool2 = await poolCollection.poolData(newReserveToken.address);
            expect(pool2.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('create pool', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: TestERC20Token;
        let poolCollection: TestPoolCollection;
        let reserveToken: TokenWithAddress;

        const testCreatePool = (symbol: string) => {
            beforeEach(async () => {
                ({ network, networkSettings, networkToken, poolCollection } = await createSystem());

                reserveToken = await createTokenBySymbol(symbol, networkToken);
            });

            it('should revert when attempting to create a pool from a non-network', async () => {
                const nonNetwork = deployer;

                await expect(poolCollection.connect(nonNetwork).createPool(reserveToken.address)).to.be.revertedWith(
                    'ERR_ACCESS_DENIED'
                );
            });

            it('should revert when attempting to create a pool for a non-whitelisted token', async () => {
                await expect(network.createPoolT(poolCollection.address, reserveToken.address)).to.be.revertedWith(
                    'ERR_TOKEN_NOT_WHITELISTED'
                );
            });

            context('with a whitelisted token', () => {
                beforeEach(async () => {
                    await networkSettings.addTokenToWhitelist(reserveToken.address);
                });

                it('should not allow to create the same pool twice', async () => {
                    await network.createPoolT(poolCollection.address, reserveToken.address);

                    await expect(network.createPoolT(poolCollection.address, reserveToken.address)).to.be.revertedWith(
                        'ERR_POOL_ALREADY_EXISTS'
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
                        .withArgs(reserveToken.address, BigNumber.from(0), pool.tradingFeePPM);
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
                        .withArgs(reserveToken.address, BigNumber.from(0), pool.depositLimit);

                    expect(await poolCollection.isPoolValid(reserveToken.address)).to.be.true;
                    expect(await poolCollection.pools()).to.include(reserveToken.address);
                    expect(await poolCollection.poolCount()).to.equal(prevPoolCount.add(BigNumber.from(1)));

                    const poolToken = await Contracts.PoolToken.attach(pool.poolToken);
                    expect(poolToken).not.to.equal(ZERO_ADDRESS);
                    expect(await poolToken.reserveToken()).to.equal(reserveToken.address);

                    expect(pool.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);
                    expect(pool.tradingEnabled).to.be.true;
                    expect(pool.depositingEnabled).to.be.true;
                    expect(pool.averageRate.time).to.equal(BigNumber.from(0));
                    expect(pool.averageRate.rate).to.equal(ZERO_FRACTION);
                    expect(pool.initialRate).to.equal(ZERO_FRACTION);
                    expect(pool.depositLimit).to.equal(BigNumber.from(0));

                    const { liquidity } = pool;
                    expect(liquidity.baseTokenTradingLiquidity).to.equal(BigNumber.from(0));
                    expect(liquidity.networkTokenTradingLiquidity).to.equal(BigNumber.from(0));
                    expect(liquidity.tradingLiquidityProduct).to.equal(BigNumber.from(0));
                    expect(liquidity.stakedBalance).to.equal(BigNumber.from(0));

                    const poolLiquidity = await poolCollection.poolLiquidity(reserveToken.address);
                    expect(poolLiquidity.baseTokenTradingLiquidity).to.equal(liquidity.baseTokenTradingLiquidity);
                    expect(poolLiquidity.networkTokenTradingLiquidity).to.equal(liquidity.networkTokenTradingLiquidity);
                    expect(poolLiquidity.tradingLiquidityProduct).to.equal(liquidity.tradingLiquidityProduct);
                    expect(poolLiquidity.stakedBalance).to.equal(liquidity.stakedBalance);
                });
            });
        };

        for (const symbol of ['ETH', 'TKN']) {
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

            reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));

            await networkSettings.addTokenToWhitelist(reserveToken.address);

            await network.createPoolT(poolCollection.address, reserveToken.address);

            newReserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
        });

        describe('initial rate', () => {
            const newInitialRate = { n: BigNumber.from(1000), d: BigNumber.from(5000) };

            it('should revert when a non-owner attempts to set the initial rate', async () => {
                await expect(
                    poolCollection.connect(nonOwner).setInitialRate(reserveToken.address, newInitialRate)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting an invalid rate', async () => {
                await expect(
                    poolCollection.setInitialRate(reserveToken.address, {
                        n: BigNumber.from(1000),
                        d: BigNumber.from(0)
                    })
                ).to.be.revertedWith('ERR_INVALID_RATE');

                await expect(
                    poolCollection.setInitialRate(reserveToken.address, {
                        n: BigNumber.from(0),
                        d: BigNumber.from(1000)
                    })
                ).to.be.revertedWith('ERR_INVALID_RATE');
            });

            it('should revert when setting the initial rate of a non-existing pool', async () => {
                await expect(poolCollection.setInitialRate(newReserveToken.address, newInitialRate)).to.be.revertedWith(
                    'ERR_POOL_DOES_NOT_EXIST'
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

                const newInitialRate2 = { n: BigNumber.from(100000), d: BigNumber.from(50) };
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
            const newTradingFee = BigNumber.from(50555);

            it('should revert when a non-owner attempts to set the trading fee', async () => {
                await expect(
                    poolCollection.connect(nonOwner).setTradingFeePPM(reserveToken.address, newTradingFee)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting an invalid trading fee', async () => {
                await expect(
                    poolCollection.setTradingFeePPM(reserveToken.address, PPM_RESOLUTION.add(BigNumber.from(1)))
                ).to.be.revertedWith('ERR_INVALID_FEE');
            });

            it('should revert when setting the trading fee of a non-existing pool', async () => {
                await expect(
                    poolCollection.setTradingFeePPM(newReserveToken.address, newTradingFee)
                ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');
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

                const newTradingFee2 = BigNumber.from(0);
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
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when enabling trading for a non-existing pool', async () => {
                await expect(poolCollection.enableTrading(newReserveToken.address, true)).to.be.revertedWith(
                    'ERR_POOL_DOES_NOT_EXIST'
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
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when enabling depositing for a non-existing pool', async () => {
                await expect(poolCollection.enableDepositing(newReserveToken.address, true)).to.be.revertedWith(
                    'ERR_POOL_DOES_NOT_EXIST'
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
            const newDepositLimit = BigNumber.from(99999);

            it('should revert when a non-owner attempts to set the deposit limit', async () => {
                await expect(
                    poolCollection.connect(nonOwner).setDepositLimit(reserveToken.address, newDepositLimit)
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when setting the deposit limit of a non-existing pool', async () => {
                await expect(
                    poolCollection.setDepositLimit(newReserveToken.address, newDepositLimit)
                ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');
            });

            it('should ignore updating to the same deposit limit', async () => {
                await poolCollection.setDepositLimit(reserveToken.address, newDepositLimit);

                const res = await poolCollection.setDepositLimit(reserveToken.address, newDepositLimit);
                await expect(res).not.to.emit(poolCollection, 'DepositLimitUpdated');
            });

            it('should allow setting and updating the deposit limit', async () => {
                let pool = await poolCollection.poolData(reserveToken.address);
                let { depositLimit } = pool;
                expect(depositLimit).to.equal(BigNumber.from(0));

                const res = await poolCollection.setDepositLimit(reserveToken.address, newDepositLimit);
                await expect(res)
                    .to.emit(poolCollection, 'DepositLimitUpdated')
                    .withArgs(reserveToken.address, depositLimit, newDepositLimit);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ depositLimit } = pool);
                expect(depositLimit).to.equal(newDepositLimit);

                const newDepositLimit2 = BigNumber.from(1);
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

    describe('withdrawal amounts', () => {
        interface WithdrawalAmountData {
            networkTokenLiquidity: string;
            baseTokenLiquidity: string;
            baseTokenExcessAmount: string;
            basePoolTokenTotalSupply: string;
            baseTokenStakedAmount: string;
            baseTokenWalletBalance: string;
            tradeFeePPM: string;
            withdrawalFeePPM: string;
            basePoolTokenWithdrawalAmount: string;
            baseTokenAmountToTransferFromVaultToProvider: string;
            networkTokenAmountToMintForProvider: string;
            baseTokenAmountToDeductFromLiquidity: string;
            baseTokenAmountToTransferFromExternalProtectionWalletToProvider: string;
            networkTokenAmountToDeductFromLiquidity: string;
            networkTokenArbitrageAmount: string;
        }

        interface MaxError {
            absolute: Decimal;
            relative: Decimal;
        }

        interface MaxErrors {
            baseTokenAmountToTransferFromVaultToProvider: MaxError;
            networkTokenAmountToMintForProvider: MaxError;
            baseTokenAmountToDeductFromLiquidity: MaxError;
            baseTokenAmountToTransferFromExternalProtectionWalletToProvider: MaxError;
            networkTokenAmountToDeductFromLiquidity: MaxError;
            networkTokenArbitrageAmount: MaxError;
        }

        const testWithdrawalAmounts = (maxNumberOfTests: number = Number.MAX_SAFE_INTEGER) => {
            let poolCollection: TestPoolCollection;

            before(async () => {
                const { network, poolTokenFactory } = await createSystem();

                poolCollection = await Contracts.TestPoolCollection.deploy(network.address, poolTokenFactory.address);
            });

            const test = (fileName: string, maxErrors: MaxErrors) => {
                const table: WithdrawalAmountData[] = JSON.parse(
                    fs.readFileSync(path.join(__dirname, '../data', `${fileName}.json`), { encoding: 'utf8' })
                ).slice(0, maxNumberOfTests);

                for (const {
                    networkTokenLiquidity,
                    baseTokenLiquidity,
                    baseTokenExcessAmount,
                    basePoolTokenTotalSupply,
                    baseTokenStakedAmount,
                    baseTokenWalletBalance,
                    tradeFeePPM,
                    withdrawalFeePPM,
                    basePoolTokenWithdrawalAmount,
                    baseTokenAmountToTransferFromVaultToProvider,
                    networkTokenAmountToMintForProvider,
                    baseTokenAmountToDeductFromLiquidity,
                    baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
                    networkTokenAmountToDeductFromLiquidity,
                    networkTokenArbitrageAmount
                } of table) {
                    it(`should receive correct withdrawal amounts (${[
                        networkTokenLiquidity,
                        baseTokenLiquidity,
                        baseTokenExcessAmount,
                        basePoolTokenTotalSupply,
                        baseTokenStakedAmount,
                        baseTokenWalletBalance,
                        tradeFeePPM,
                        withdrawalFeePPM,
                        basePoolTokenWithdrawalAmount,
                        baseTokenAmountToTransferFromVaultToProvider,
                        networkTokenAmountToMintForProvider,
                        baseTokenAmountToDeductFromLiquidity,
                        baseTokenAmountToTransferFromExternalProtectionWalletToProvider,
                        networkTokenAmountToDeductFromLiquidity,
                        networkTokenArbitrageAmount
                    ]})`, async () => {
                        const actual = await poolCollection.withdrawalAmountsT(
                            networkTokenLiquidity,
                            baseTokenLiquidity,
                            baseTokenExcessAmount,
                            basePoolTokenTotalSupply,
                            baseTokenStakedAmount,
                            baseTokenWalletBalance,
                            tradeFeePPM,
                            withdrawalFeePPM,
                            basePoolTokenWithdrawalAmount
                        );
                        expect(actual.baseTokenAmountToTransferFromVaultToProvider).to.almostEqual(
                            new Decimal(baseTokenAmountToTransferFromVaultToProvider),
                            {
                                maxAbsoluteError: maxErrors.baseTokenAmountToTransferFromVaultToProvider.absolute,
                                maxRelativeError: maxErrors.baseTokenAmountToTransferFromVaultToProvider.relative
                            }
                        );
                        expect(actual.networkTokenAmountToMintForProvider).to.almostEqual(
                            new Decimal(networkTokenAmountToMintForProvider),
                            {
                                maxAbsoluteError: maxErrors.networkTokenAmountToMintForProvider.absolute,
                                maxRelativeError: maxErrors.networkTokenAmountToMintForProvider.relative
                            }
                        );
                        expect(actual.baseTokenAmountToDeductFromLiquidity).to.almostEqual(
                            new Decimal(baseTokenAmountToDeductFromLiquidity),
                            {
                                maxAbsoluteError: maxErrors.baseTokenAmountToDeductFromLiquidity.absolute,
                                maxRelativeError: maxErrors.baseTokenAmountToDeductFromLiquidity.relative
                            }
                        );
                        expect(actual.baseTokenAmountToTransferFromExternalProtectionWalletToProvider).to.almostEqual(
                            new Decimal(baseTokenAmountToTransferFromExternalProtectionWalletToProvider),
                            {
                                maxAbsoluteError:
                                    maxErrors.baseTokenAmountToTransferFromExternalProtectionWalletToProvider.absolute,
                                maxRelativeError:
                                    maxErrors.baseTokenAmountToTransferFromExternalProtectionWalletToProvider.relative
                            }
                        );
                        expect(actual.networkTokenAmountToDeductFromLiquidity).to.almostEqual(
                            new Decimal(networkTokenAmountToDeductFromLiquidity),
                            {
                                maxAbsoluteError: maxErrors.networkTokenAmountToDeductFromLiquidity.absolute,
                                maxRelativeError: maxErrors.networkTokenAmountToDeductFromLiquidity.relative
                            }
                        );
                        expect(actual.networkTokenArbitrageAmount).to.almostEqual(
                            new Decimal(networkTokenArbitrageAmount),
                            {
                                maxAbsoluteError: maxErrors.networkTokenArbitrageAmount.absolute,
                                maxRelativeError: maxErrors.networkTokenArbitrageAmount.relative
                            }
                        );
                    });
                }
            };

            describe('regular cases', () => {
                const maxErrors = {
                    baseTokenAmountToTransferFromVaultToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000000000000000002')
                    },
                    networkTokenAmountToMintForProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000000000000000003')
                    },
                    baseTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000000000000000002')
                    },
                    baseTokenAmountToTransferFromExternalProtectionWalletToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0')
                    },
                    networkTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000000000000000003')
                    },
                    networkTokenArbitrageAmount: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.00000000000000002')
                    }
                };

                test('WithdrawalAmountsRegularCases', maxErrors);
            });

            describe('edge cases 1', () => {
                const maxErrors = {
                    baseTokenAmountToTransferFromVaultToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.000000003')
                    },
                    networkTokenAmountToMintForProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000000003')
                    },
                    baseTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.00000000002')
                    },
                    baseTokenAmountToTransferFromExternalProtectionWalletToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0')
                    },
                    networkTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000000001')
                    },
                    networkTokenArbitrageAmount: { absolute: new Decimal(1), relative: new Decimal('0.000000002') }
                };

                test('WithdrawalAmountsEdgeCases1', maxErrors);
            });

            describe('edge cases 2', () => {
                const maxErrors = {
                    baseTokenAmountToTransferFromVaultToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000004')
                    },
                    networkTokenAmountToMintForProvider: { absolute: new Decimal(1), relative: new Decimal('0.00009') },
                    baseTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.000002')
                    },
                    baseTokenAmountToTransferFromExternalProtectionWalletToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0')
                    },
                    networkTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.00002')
                    },
                    networkTokenArbitrageAmount: { absolute: new Decimal(1), relative: new Decimal('0.0007') }
                };

                test('WithdrawalAmountsEdgeCases2', maxErrors);
            });

            describe('coverage 1', () => {
                const maxErrors = {
                    baseTokenAmountToTransferFromVaultToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0002')
                    },
                    networkTokenAmountToMintForProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000002')
                    },
                    baseTokenAmountToDeductFromLiquidity: { absolute: new Decimal(1), relative: new Decimal('0.0002') },
                    baseTokenAmountToTransferFromExternalProtectionWalletToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0')
                    },
                    networkTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0002')
                    },
                    networkTokenArbitrageAmount: { absolute: new Decimal(1), relative: new Decimal('0.0002') }
                };

                test('WithdrawalAmountsCoverage1', maxErrors);
            });

            describe('coverage 2', () => {
                const maxErrors = {
                    baseTokenAmountToTransferFromVaultToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.000000003')
                    },
                    networkTokenAmountToMintForProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.000000003')
                    },
                    baseTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.000000003')
                    },
                    baseTokenAmountToTransferFromExternalProtectionWalletToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0')
                    },
                    networkTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.000000003')
                    },
                    networkTokenArbitrageAmount: { absolute: new Decimal(1), relative: new Decimal('0.000000003') }
                };

                test('WithdrawalAmountsCoverage2', maxErrors);
            });

            describe('coverage 3', () => {
                const maxErrors = {
                    baseTokenAmountToTransferFromVaultToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.008')
                    },
                    networkTokenAmountToMintForProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.000002')
                    },
                    baseTokenAmountToDeductFromLiquidity: { absolute: new Decimal(1), relative: new Decimal('0.008') },
                    baseTokenAmountToTransferFromExternalProtectionWalletToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0')
                    },
                    networkTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.008')
                    },
                    networkTokenArbitrageAmount: { absolute: new Decimal(1), relative: new Decimal('0.008') }
                };

                test('WithdrawalAmountsCoverage3', maxErrors);
            });

            describe('coverage 4', () => {
                const maxErrors = {
                    baseTokenAmountToTransferFromVaultToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000009')
                    },
                    networkTokenAmountToMintForProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000000002')
                    },
                    baseTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000009')
                    },
                    baseTokenAmountToTransferFromExternalProtectionWalletToProvider: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0')
                    },
                    networkTokenAmountToDeductFromLiquidity: {
                        absolute: new Decimal(1),
                        relative: new Decimal('0.0000009')
                    },
                    networkTokenArbitrageAmount: { absolute: new Decimal(1), relative: new Decimal('0.0000009') }
                };

                test('WithdrawalAmountsCoverage4', maxErrors);
            });
        };

        describe('regular tests', () => {
            testWithdrawalAmounts(10);
        });

        describe('@stress tests', () => {
            testWithdrawalAmounts();
        });
    });

    describe('deposit', () => {
        const testDeposit = (symbol: string) => {
            let networkSettings: NetworkSettings;
            let network: TestBancorNetwork;
            let networkToken: TestERC20Token;
            let poolCollection: TestPoolCollection;
            let reserveToken: TokenWithAddress;

            let provider: SignerWithAddress;

            before(async () => {
                [deployer, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ network, networkSettings, networkToken, poolCollection } = await createSystem());

                reserveToken = await createTokenBySymbol(symbol, networkToken);
            });

            it('should revert when attempting to deposit from a non-network', async () => {
                const nonNetwork = deployer;

                await expect(
                    poolCollection
                        .connect(nonNetwork)
                        .depositFor(provider.address, reserveToken.address, BigNumber.from(1), BigNumber.from(2))
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when attempting to deposit for an invalid provider', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        ZERO_ADDRESS,
                        reserveToken.address,
                        BigNumber.from(1),
                        BigNumber.from(2)
                    )
                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });

            it('should revert when attempting to deposit for an invalid pool', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        provider.address,
                        ZERO_ADDRESS,
                        BigNumber.from(1),
                        BigNumber.from(2)
                    )
                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });

            it('should revert when attempting to deposit into a pool that does not exist', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        provider.address,
                        reserveToken.address,
                        BigNumber.from(1),
                        BigNumber.from(2)
                    )
                ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');
            });

            it('should revert when attempting to deposit an invalid amount', async () => {
                await expect(
                    network.depositToPoolCollectionForT(
                        poolCollection.address,
                        provider.address,
                        reserveToken.address,
                        BigNumber.from(0),
                        BigNumber.from(2)
                    )
                ).to.be.revertedWith('ERR_ZERO_VALUE');
            });

            context('with a registered pool', () => {
                let poolToken: PoolToken;

                beforeEach(async () => {
                    poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);
                });

                context('when at the deposit limit', () => {
                    const DEPOSIT_LIMIT = toWei(BigNumber.from(12345));

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
                                BigNumber.from(1),
                                MAX_UINT256
                            )
                        ).to.be.revertedWith('ERR_DEPOSIT_LIMIT_EXCEEDED');
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

                        const depositAmounts = await network.callStatic.depositToPoolCollectionForT(
                            poolCollection.address,
                            provider.address,
                            reserveToken.address,
                            baseTokenAmount,
                            unallocatedNetworkTokenLiquidity
                        );

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
                                    BigNumber.from(1),
                                    MAX_UINT256
                                )
                            ).to.be.revertedWith('ERR_MIN_LIQUIDITY_NOT_SET');
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
                                            BigNumber.from(1),
                                            MAX_UINT256
                                        )
                                    ).to.be.revertedWith('ERR_NO_INITIAL_RATE');
                                });
                            });

                            context('when initial rate was set', () => {
                                beforeEach(async () => {
                                    await poolCollection.setInitialRate(reserveToken.address, INITIAL_RATE);
                                });

                                it('should deposit', async () => {
                                    for (const amount of [
                                        BigNumber.from(1),
                                        BigNumber.from(10_000),
                                        toWei(BigNumber.from(1_000_000)),
                                        toWei(BigNumber.from(500_000))
                                    ]) {
                                        await testDepositFor(amount);
                                    }
                                });

                                context('when exceeding the unallocated network token liquidity', () => {
                                    it('should deposit', async () => {
                                        for (const amount of [
                                            toWei(BigNumber.from(1_000_000)),
                                            toWei(BigNumber.from(10_000_000)),
                                            toWei(BigNumber.from(50_000_000))
                                        ]) {
                                            await testDepositFor(amount, toWei(BigNumber.from(20_000)));
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
                                for (const amount of [
                                    BigNumber.from(1),
                                    BigNumber.from(10_000),
                                    toWei(BigNumber.from(1_000_000)),
                                    toWei(BigNumber.from(500_000))
                                ]) {
                                    await testDepositFor(amount);
                                }
                            });

                            context('when exceeding the unallocated network token liquidity', () => {
                                it('should deposit', async () => {
                                    for (const amount of [
                                        toWei(BigNumber.from(1_000_000)),
                                        toWei(BigNumber.from(10_000_000)),
                                        toWei(BigNumber.from(50_000_000))
                                    ]) {
                                        await testDepositFor(amount, toWei(BigNumber.from(20_000)));
                                    }
                                });
                            });
                        });
                    });
                });
            });
        };

        for (const symbol of ['ETH', 'TKN']) {
            context(symbol, () => {
                testDeposit(symbol);
            });
        }
    });

    describe('withdraw', () => {
        const testWithdraw = (symbol: string) => {
            let networkSettings: NetworkSettings;
            let network: TestBancorNetwork;
            let networkToken: TestERC20Token;
            let poolCollection: TestPoolCollection;
            let poolToken: PoolToken;
            let reserveToken: TokenWithAddress;

            let provider: SignerWithAddress;

            before(async () => {
                [deployer, provider] = await ethers.getSigners();
            });

            beforeEach(async () => {
                ({ network, networkSettings, networkToken, poolCollection } = await createSystem());

                await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

                reserveToken = await createTokenBySymbol(symbol, networkToken);

                poolToken = await createPool(reserveToken, network, networkSettings, poolCollection);

                await poolCollection.setDepositLimit(reserveToken.address, MAX_UINT256);
                await poolCollection.setInitialRate(reserveToken.address, INITIAL_RATE);
            });

            it('should revert when attempting to withdraw from a non-network', async () => {
                const nonNetwork = deployer;

                await expect(
                    poolCollection
                        .connect(nonNetwork)
                        .withdraw(reserveToken.address, BigNumber.from(1), BigNumber.from(1), BigNumber.from(1))
                ).to.be.revertedWith('ERR_ACCESS_DENIED');
            });

            it('should revert when attempting to withdraw from an invalid pool', async () => {
                await expect(
                    network.withdrawFromPoolCollectionT(
                        poolCollection.address,
                        ZERO_ADDRESS,
                        BigNumber.from(1),
                        BigNumber.from(1),
                        BigNumber.from(1)
                    )
                ).to.be.revertedWith('ERR_INVALID_ADDRESS');
            });

            it('should revert when attempting to withdraw an invalid amount', async () => {
                await expect(
                    network.withdrawFromPoolCollectionT(
                        poolCollection.address,
                        reserveToken.address,
                        BigNumber.from(0),
                        BigNumber.from(1),
                        BigNumber.from(1)
                    )
                ).to.be.revertedWith('ERR_ZERO_VALUE');
            });

            it('should reset the average rate when the pool is emptied', async () => {
                const baseTokenAmount = BigNumber.from(1000);

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

                await network.withdrawFromPoolCollectionT(
                    poolCollection.address,
                    reserveToken.address,
                    poolTokenAmount,
                    baseTokenAmount,
                    BigNumber.from(0)
                );

                const poolData = await poolCollection.poolData(reserveToken.address);
                expect(poolData.liquidity.baseTokenTradingLiquidity).to.equal(BigNumber.from(0));
                expect(poolData.averageRate.rate).to.equal(ZERO_FRACTION);
            });
        };

        for (const symbol of ['ETH', 'TKN']) {
            context(symbol, () => {
                testWithdraw(symbol);
            });
        }
    });

    describe('trading', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let networkToken: TestERC20Token;
        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        const MIN_RETURN_AMOUNT = BigNumber.from(1);

        beforeEach(async () => {
            ({ network, networkToken, networkSettings, poolCollection } = await createSystem());

            await networkSettings.setMinLiquidityForTrading(MIN_LIQUIDITY_FOR_TRADING);

            reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));

            await createPool(reserveToken, network, networkSettings, poolCollection);
        });

        const testTrading = (isSourceNetworkToken: boolean) => {
            const fromTokenName = isSourceNetworkToken ? 'network token' : 'base token';
            const toTokenName = isSourceNetworkToken ? 'base token' : 'network token';
            context(`from ${fromTokenName} to ${toTokenName}`, () => {
                let sourcePool: TestERC20Token;
                let targetPool: TestERC20Token;

                beforeEach(async () => {
                    sourcePool = isSourceNetworkToken ? networkToken : reserveToken;
                    targetPool = isSourceNetworkToken ? reserveToken : networkToken;
                });

                it('should revert when attempting to trade from a non-network', async () => {
                    const nonNetwork = deployer;

                    await expect(
                        poolCollection
                            .connect(nonNetwork)
                            .trade(sourcePool.address, targetPool.address, BigNumber.from(1), MIN_RETURN_AMOUNT)
                    ).to.be.revertedWith('ERR_ACCESS_DENIED');
                });

                it('should revert when attempting to trade or query using an invalid source pool', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            ZERO_ADDRESS,
                            targetPool.address,
                            BigNumber.from(1),
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('ERR_INVALID_ADDRESS');

                    await expect(
                        poolCollection.targetAmountAndFee(ZERO_ADDRESS, targetPool.address, BigNumber.from(1))
                    ).to.be.revertedWith('ERR_INVALID_ADDRESS');

                    await expect(
                        poolCollection.sourceAmountAndFee(ZERO_ADDRESS, targetPool.address, BigNumber.from(1))
                    ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                });

                it('should revert when attempting to trade or query using an invalid target pool', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            sourcePool.address,
                            ZERO_ADDRESS,
                            BigNumber.from(1),
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('ERR_INVALID_ADDRESS');

                    await expect(
                        poolCollection.targetAmountAndFee(sourcePool.address, ZERO_ADDRESS, BigNumber.from(1))
                    ).to.be.revertedWith('ERR_INVALID_ADDRESS');

                    await expect(
                        poolCollection.sourceAmountAndFee(sourcePool.address, ZERO_ADDRESS, BigNumber.from(1))
                    ).to.be.revertedWith('ERR_INVALID_ADDRESS');
                });

                it('should revert when attempting to trade or query using a non-existing source pool', async () => {
                    const reserveToken2 = await Contracts.TestERC20Token.deploy(
                        SYMBOL,
                        SYMBOL,
                        BigNumber.from(1_000_000)
                    );

                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            reserveToken2.address,
                            networkToken.address,
                            BigNumber.from(1),
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');

                    await expect(
                        poolCollection.targetAmountAndFee(
                            reserveToken2.address,
                            networkToken.address,
                            BigNumber.from(1)
                        )
                    ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');

                    await expect(
                        poolCollection.sourceAmountAndFee(
                            reserveToken2.address,
                            networkToken.address,
                            BigNumber.from(1)
                        )
                    ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');
                });

                it('should revert when attempting to trade or query using a non-existing target pool', async () => {
                    const reserveToken2 = await Contracts.TestERC20Token.deploy(
                        SYMBOL,
                        SYMBOL,
                        BigNumber.from(1_000_000)
                    );

                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            networkToken.address,
                            reserveToken2.address,
                            BigNumber.from(1),
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');

                    await expect(
                        poolCollection.targetAmountAndFee(
                            networkToken.address,
                            reserveToken2.address,
                            BigNumber.from(1)
                        )
                    ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');

                    await expect(
                        poolCollection.sourceAmountAndFee(
                            networkToken.address,
                            reserveToken2.address,
                            BigNumber.from(1)
                        )
                    ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');
                });

                it('should revert when attempting to trade or query using an invalid source and target pool pair', async () => {
                    const reserveToken2 = await Contracts.TestERC20Token.deploy(
                        SYMBOL,
                        SYMBOL,
                        BigNumber.from(1_000_000)
                    );

                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            reserveToken.address,
                            reserveToken2.address,
                            BigNumber.from(1),
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('ERR_INVALID_POOLS');

                    await expect(
                        poolCollection.targetAmountAndFee(
                            reserveToken.address,
                            reserveToken2.address,
                            BigNumber.from(1)
                        )
                    ).to.be.revertedWith('ERR_INVALID_POOLS');

                    await expect(
                        poolCollection.sourceAmountAndFee(
                            reserveToken.address,
                            reserveToken2.address,
                            BigNumber.from(1)
                        )
                    ).to.be.revertedWith('ERR_INVALID_POOLS');
                });

                it('should revert when attempting to trade or query with an invalid amount', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            sourcePool.address,
                            targetPool.address,
                            BigNumber.from(0),
                            MIN_RETURN_AMOUNT
                        )
                    ).to.be.revertedWith('ERR_ZERO_VALUE');

                    await expect(
                        poolCollection.targetAmountAndFee(sourcePool.address, targetPool.address, BigNumber.from(0))
                    ).to.be.revertedWith('ERR_ZERO_VALUE');

                    await expect(
                        poolCollection.sourceAmountAndFee(sourcePool.address, targetPool.address, BigNumber.from(0))
                    ).to.be.revertedWith('ERR_ZERO_VALUE');
                });

                it('should revert when attempting to trade with an invalid minimum return amount', async () => {
                    await expect(
                        network.tradePoolCollectionT(
                            poolCollection.address,
                            sourcePool.address,
                            targetPool.address,
                            BigNumber.from(1),
                            BigNumber.from(0)
                        )
                    ).to.be.revertedWith('ERR_ZERO_VALUE');
                });

                context('when trading is disabled', () => {
                    beforeEach(async () => {
                        await poolCollection.enableTrading(reserveToken.address, false);
                    });

                    it('should revert when attempting to trade or query', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                sourcePool.address,
                                targetPool.address,
                                BigNumber.from(1),
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('ERR_TRADING_DISABLED');

                        await expect(
                            poolCollection.targetAmountAndFee(sourcePool.address, targetPool.address, BigNumber.from(1))
                        ).to.be.revertedWith('ERR_TRADING_DISABLED');

                        await expect(
                            poolCollection.sourceAmountAndFee(sourcePool.address, targetPool.address, BigNumber.from(1))
                        ).to.be.revertedWith('ERR_TRADING_DISABLED');
                    });
                });

                context('with insufficient network token liquidity', () => {
                    it('should revert when attempting to trade or query', async () => {
                        await expect(
                            network.tradePoolCollectionT(
                                poolCollection.address,
                                sourcePool.address,
                                targetPool.address,
                                BigNumber.from(1),
                                MIN_RETURN_AMOUNT
                            )
                        ).to.be.revertedWith('ERR_INSUFFICIENT_NETWORK_LIQUIDITY');

                        await expect(
                            poolCollection.targetAmountAndFee(sourcePool.address, targetPool.address, BigNumber.from(1))
                        ).to.be.revertedWith('ERR_INSUFFICIENT_NETWORK_LIQUIDITY');

                        await expect(
                            poolCollection.sourceAmountAndFee(sourcePool.address, targetPool.address, BigNumber.from(1))
                        ).to.be.revertedWith('ERR_INSUFFICIENT_NETWORK_LIQUIDITY');
                    });
                });

                context('with sufficient network token liquidity', () => {
                    const testTargetPool = isSourceNetworkToken;

                    beforeEach(async () => {
                        const networkTokenTradingLiquidity = MIN_LIQUIDITY_FOR_TRADING;
                        const baseTokenTradingLiquidity = BigNumber.from(0);

                        await poolCollection.setTradingLiquidityT(reserveToken.address, {
                            networkTokenTradingLiquidity,
                            baseTokenTradingLiquidity,
                            tradingLiquidityProduct: networkTokenTradingLiquidity.mul(baseTokenTradingLiquidity),
                            stakedBalance: baseTokenTradingLiquidity
                        });
                    });

                    context(`with insufficient ${testTargetPool ? 'target' : 'source'} pool balance`, () => {
                        const amount = BigNumber.from(12345);

                        if (testTargetPool) {
                            it('should revert when attempting to trade or query', async () => {
                                await expect(
                                    network.tradePoolCollectionT(
                                        poolCollection.address,
                                        sourcePool.address,
                                        targetPool.address,
                                        amount,
                                        MIN_RETURN_AMOUNT
                                    )
                                ).to.be.revertedWith('ERR_INVALID_POOL_BALANCE');

                                await expect(
                                    poolCollection.sourceAmountAndFee(sourcePool.address, targetPool.address, amount)
                                ).to.be.revertedWith('ERR_INVALID_POOL_BALANCE');
                            });
                        } else {
                            for (const sourceBalance of [BigNumber.from(0), amount.sub(BigNumber.from(1))]) {
                                context(`with ${sourceBalance} source pool balance`, () => {
                                    beforeEach(async () => {
                                        const networkTokenTradingLiquidity = MIN_LIQUIDITY_FOR_TRADING;
                                        const baseTokenTradingLiquidity = sourceBalance;

                                        await poolCollection.setTradingLiquidityT(reserveToken.address, {
                                            networkTokenTradingLiquidity,
                                            baseTokenTradingLiquidity,
                                            tradingLiquidityProduct:
                                                networkTokenTradingLiquidity.mul(baseTokenTradingLiquidity),
                                            stakedBalance: baseTokenTradingLiquidity
                                        });
                                    });

                                    it('should revert when attempting to trade or query', async () => {
                                        await expect(
                                            network.tradePoolCollectionT(
                                                poolCollection.address,
                                                sourcePool.address,
                                                targetPool.address,
                                                amount,
                                                MIN_RETURN_AMOUNT
                                            )
                                        ).to.be.revertedWith('ERR_INVALID_POOL_BALANCE');

                                        await expect(
                                            poolCollection.targetAmountAndFee(
                                                sourcePool.address,
                                                targetPool.address,
                                                amount
                                            )
                                        ).to.be.revertedWith('ERR_INVALID_POOL_BALANCE');
                                    });
                                });
                            }
                        }
                    });

                    context('with sufficient target and source pool balances', () => {
                        beforeEach(async () => {
                            const networkTokenTradingLiquidity = MIN_LIQUIDITY_FOR_TRADING.mul(BigNumber.from(1000));

                            // for the tests below, ensure that the source to target ratio above 1, such that a zero
                            // trading result is possible
                            const baseTokenTradingLiquidity = isSourceNetworkToken
                                ? networkTokenTradingLiquidity.div(BigNumber.from(2))
                                : networkTokenTradingLiquidity.mul(BigNumber.from(2));

                            await poolCollection.setTradingLiquidityT(reserveToken.address, {
                                networkTokenTradingLiquidity,
                                baseTokenTradingLiquidity,
                                tradingLiquidityProduct: networkTokenTradingLiquidity.mul(baseTokenTradingLiquidity),
                                stakedBalance: baseTokenTradingLiquidity
                            });
                        });

                        it('should revert when the trade result is zero', async () => {
                            await expect(
                                network.tradePoolCollectionT(
                                    poolCollection.address,
                                    sourcePool.address,
                                    targetPool.address,
                                    BigNumber.from(1),
                                    MIN_RETURN_AMOUNT
                                )
                            ).to.be.revertedWith('ERR_ZERO_TARGET_AMOUNT');
                        });

                        it('should revert when the trade result is below the minimum return amount', async () => {
                            await expect(
                                network.tradePoolCollectionT(
                                    poolCollection.address,
                                    sourcePool.address,
                                    targetPool.address,
                                    toWei(BigNumber.from(12345)),
                                    MAX_UINT256
                                )
                            ).to.be.revertedWith('ERR_RETURN_TOO_LOW');
                        });
                    });
                });

                // for (const seconds of [0, 1, 2, 3, 10, 100, 200, 300, 400, 500]) {

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
                        type Unpack<T> = T extends Promise<infer U> ? U : T;
                        type PoolData = Unpack<ReturnType<TestPoolCollection['poolData']>>;
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

                            const sourcePoolBalance = isSourceNetworkToken
                                ? liquidity.networkTokenTradingLiquidity
                                : liquidity.baseTokenTradingLiquidity;
                            const targetPoolBalance = isSourceNetworkToken
                                ? liquidity.baseTokenTradingLiquidity
                                : liquidity.networkTokenTradingLiquidity;

                            const amount = targetPoolBalance.mul(sourceAmount).div(sourcePoolBalance.add(sourceAmount));
                            const feeAmount = amount.mul(poolData.tradingFeePPM).div(PPM_RESOLUTION);

                            return { amount: amount.sub(feeAmount), feeAmount };
                        };

                        let poolAverageRate: TestPoolAverageRate;

                        before(async () => {
                            poolAverageRate = await Contracts.TestPoolAverageRate.deploy();
                        });

                        beforeEach(async () => {
                            const networkTokenTradingLiquidity = isSourceNetworkToken ? sourceBalance : targetBalance;
                            const baseTokenTradingLiquidity = isSourceNetworkToken ? targetBalance : sourceBalance;

                            await poolCollection.setTradingLiquidityT(reserveToken.address, {
                                networkTokenTradingLiquidity,
                                baseTokenTradingLiquidity,
                                tradingLiquidityProduct: networkTokenTradingLiquidity.mul(baseTokenTradingLiquidity),
                                stakedBalance: baseTokenTradingLiquidity
                            });

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

                                const targetAmountAndFee = await poolCollection.targetAmountAndFee(
                                    sourcePool.address,
                                    targetPool.address,
                                    amount
                                );
                                const sourceAmountAndFee = await poolCollection.sourceAmountAndFee(
                                    sourcePool.address,
                                    targetPool.address,
                                    targetAmountAndFee.amount
                                );

                                const tradeAmounts = await network.callStatic.tradePoolCollectionT(
                                    poolCollection.address,
                                    sourcePool.address,
                                    targetPool.address,
                                    amount,
                                    MIN_RETURN_AMOUNT
                                );

                                await network.tradePoolCollectionT(
                                    poolCollection.address,
                                    sourcePool.address,
                                    targetPool.address,
                                    amount,
                                    MIN_RETURN_AMOUNT
                                );

                                const expectedTargetAmounts = expectedTargetAmountAndFee(amount, prevPoolData);
                                expect(targetAmountAndFee.amount).to.almostEqual(expectedTargetAmounts.amount, {
                                    maxRelativeError: new Decimal(0.0001)
                                });
                                expect(targetAmountAndFee.feeAmount).to.almostEqual(expectedTargetAmounts.feeAmount, {
                                    maxRelativeError: new Decimal(0.0001)
                                });

                                expect(tradeAmounts.amount).to.equal(targetAmountAndFee.amount);
                                expect(tradeAmounts.feeAmount).to.equal(targetAmountAndFee.feeAmount);

                                expect(sourceAmountAndFee.amount).to.almostEqual(amount, {
                                    maxRelativeError: new Decimal(0.0001)
                                });
                                expect(sourceAmountAndFee.feeAmount).to.almostEqual(targetAmountAndFee.feeAmount, {
                                    maxRelativeError: new Decimal(0.0001)
                                });

                                const poolData = await poolCollection.poolData(reserveToken.address);
                                const { liquidity } = poolData;

                                if (isSourceNetworkToken) {
                                    expect(liquidity.networkTokenTradingLiquidity).to.equal(
                                        prevLiquidity.networkTokenTradingLiquidity.add(amount)
                                    );
                                    expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                        prevLiquidity.baseTokenTradingLiquidity.sub(tradeAmounts.amount)
                                    );
                                    expect(liquidity.stakedBalance).to.equal(
                                        prevLiquidity.stakedBalance.add(tradeAmounts.feeAmount)
                                    );
                                } else {
                                    expect(liquidity.baseTokenTradingLiquidity).to.equal(
                                        prevLiquidity.baseTokenTradingLiquidity.add(amount)
                                    );
                                    expect(liquidity.networkTokenTradingLiquidity).to.equal(
                                        prevLiquidity.networkTokenTradingLiquidity.sub(tradeAmounts.amount)
                                    );
                                }

                                expect(liquidity.tradingLiquidityProduct).to.equal(
                                    liquidity.networkTokenTradingLiquidity.mul(liquidity.baseTokenTradingLiquidity)
                                );

                                // verify that the average rate has been updated
                                const expectedNewAverageRate = await expectedAverageRate(prevPoolData, interval);
                                expect(poolData.averageRate.time).to.equal(expectedNewAverageRate.time);
                                expect(poolData.averageRate.rate).to.equal(expectedNewAverageRate.rate);
                            }
                        });
                    });
                };

                describe.skip('regular tests', () => {
                    for (const sourceBalance of [1_000_000, 5_000_000]) {
                        for (const targetBalance of [1_000_000, 5_000_000]) {
                            for (const tradingFeePPM of [0, 100_000]) {
                                for (const amount of [1000]) {
                                    testTrading({
                                        sourceBalance: toWei(BigNumber.from(sourceBalance)),
                                        targetBalance: toWei(BigNumber.from(targetBalance)),
                                        tradingFeePPM,
                                        amount: toWei(BigNumber.from(amount)),
                                        intervals: [0, 200, 500]
                                    });
                                }
                            }
                        }
                    }
                });

                describe('@stress tests', () => {
                    for (const sourceBalance of [1_000_000, 5_000_000, 50_000_000, 100_000_000]) {
                        for (const targetBalance of [1_000_000, 5_000_000, 50_000_000, 100_000_000]) {
                            for (const tradingFeePPM of [0, 10_000, 100_000, 500_000]) {
                                for (const amount of [1000, 10_000, 100_000]) {
                                    testTrading({
                                        sourceBalance: toWei(BigNumber.from(sourceBalance)),
                                        targetBalance: toWei(BigNumber.from(targetBalance)),
                                        tradingFeePPM,
                                        amount: toWei(BigNumber.from(amount)),
                                        intervals: [0, 1, 2, 3, 10, 100, 200, 300, 400, 500]
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

            reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));

            await createPool(reserveToken, network, networkSettings, poolCollection);
        });

        it('should revert when attempting to get notified about collected fee from a non-network', async () => {
            const nonNetwork = deployer;

            await expect(
                poolCollection.connect(nonNetwork).onFeesCollected(reserveToken.address, BigNumber.from(1))
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when attempting to get notified about collected fee from an invalid pool', async () => {
            await expect(
                network.onPoolCollectionFeesCollectedT(poolCollection.address, ZERO_ADDRESS, BigNumber.from(1))
            ).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should revert when attempting to get notified about collected fee from a non-existing pool', async () => {
            const reserveToken2 = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));

            await expect(
                network.onPoolCollectionFeesCollectedT(poolCollection.address, reserveToken2.address, BigNumber.from(1))
            ).to.be.revertedWith('ERR_POOL_DOES_NOT_EXIST');
        });

        for (const feeAmount of [BigNumber.from(0), BigNumber.from(12345), toWei(BigNumber.from(12345))]) {
            it(`should collect fees of ${feeAmount.toString()}`, async () => {
                const prevPoolLiquidity = await poolCollection.poolLiquidity(reserveToken.address);

                await network.onPoolCollectionFeesCollectedT(poolCollection.address, reserveToken.address, feeAmount);

                const poolLiquidity = await poolCollection.poolLiquidity(reserveToken.address);

                expect(poolLiquidity.stakedBalance).to.equal(prevPoolLiquidity.stakedBalance.add(feeAmount));
            });
        }
    });
});
