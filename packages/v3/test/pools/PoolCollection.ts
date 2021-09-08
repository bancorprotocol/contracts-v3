import Contracts from '../../components/Contracts';
import { TestPoolCollection, TestERC20Token, TestBancorNetwork, NetworkSettings } from '../../typechain';
import { ZERO_ADDRESS, INVALID_FRACTION, PPM_RESOLUTION } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { TokenWithAddress, createTokenBySymbol } from '../helpers/Utils';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import fs from 'fs';
import { ethers } from 'hardhat';
import path from 'path';

describe('PoolCollection', () => {
    const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
    const POOL_TYPE = BigNumber.from(1);
    const SYMBOL = 'TKN';
    const EMPTY_STRING = '';
    const INITIAL_RATE = {
        n: BigNumber.from(0),
        d: BigNumber.from(1)
    };

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when initialized with an invalid network contract', async () => {
            await expect(Contracts.PoolCollection.deploy(ZERO_ADDRESS)).to.be.revertedWith('ERR_INVALID_ADDRESS');
        });

        it('should be properly initialized', async () => {
            const { network, networkSettings, poolCollection } = await createSystem();

            expect(await poolCollection.version()).to.equal(1);

            expect(await poolCollection.poolType()).to.equal(POOL_TYPE);
            expect(await poolCollection.network()).to.equal(network.address);
            expect(await poolCollection.settings()).to.equal(networkSettings.address);
            expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });

        it('should emit events on initialization', async () => {
            const { poolCollection } = await createSystem();

            await expect(poolCollection.deployTransaction)
                .to.emit(poolCollection, 'DefaultTradingFeePPMUpdated')
                .withArgs(BigNumber.from(0), DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('token symbol overrides', async () => {
        const newSymbol = 'TKN2';

        let poolCollection: TestPoolCollection;
        let reserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ poolCollection } = await createSystem());

            reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
        });

        it('should revert when a non-owner attempts to set a token symbol override', async () => {
            await expect(
                poolCollection.connect(nonOwner).setTokenSymbolOverride(reserveToken.address, newSymbol)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be able to set and update a token symbol override', async () => {
            expect(await poolCollection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);

            await poolCollection.setTokenSymbolOverride(reserveToken.address, newSymbol);
            expect(await poolCollection.tokenSymbolOverride(reserveToken.address)).to.equal(newSymbol);

            await poolCollection.setTokenSymbolOverride(reserveToken.address, SYMBOL);
            expect(await poolCollection.tokenSymbolOverride(reserveToken.address)).to.equal(SYMBOL);

            await poolCollection.setTokenSymbolOverride(reserveToken.address, EMPTY_STRING);
            expect(await poolCollection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);
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

        const poolTokenSymbol = (symbol: string) => `bn${symbol}`;
        const poolTokenName = (symbol: string) => `Bancor ${symbol} Pool Token`;

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
                    expect(await poolCollection.isPoolValid(reserveToken.address)).to.be.false;

                    const res = await network.createPoolT(poolCollection.address, reserveToken.address);
                    const pool = await poolCollection.poolData(reserveToken.address);

                    await expect(res)
                        .to.emit(poolCollection, 'PoolCreated')
                        .withArgs(pool.poolToken, reserveToken.address);
                    await expect(res)
                        .to.emit(poolCollection, 'TradingFeePPMUpdated')
                        .withArgs(reserveToken.address, BigNumber.from(0), pool.tradingFeePPM);
                    await expect(res).to.emit(poolCollection, 'TradingEnabled').withArgs(reserveToken.address, false);
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
                    const poolToken = await Contracts.PoolToken.attach(pool.poolToken);
                    expect(poolToken).not.to.equal(ZERO_ADDRESS);
                    const reserveTokenSymbol = symbol;
                    expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                    expect(await poolToken.symbol()).to.equal(poolTokenSymbol(reserveTokenSymbol));
                    expect(await poolToken.name()).to.equal(poolTokenName(reserveTokenSymbol));

                    expect(pool.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);
                    expect(pool.tradingEnabled).to.be.true;
                    expect(pool.depositingEnabled).to.be.true;
                    expect(pool.averageRate.time).to.equal(BigNumber.from(0));
                    expect(pool.averageRate.rate).to.equal(INITIAL_RATE);
                    expect(pool.initialRate).to.equal(INITIAL_RATE);
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

                context('with a token symbol override', () => {
                    const newSymbol = 'TKN2';

                    beforeEach(async () => {
                        await poolCollection.setTokenSymbolOverride(reserveToken.address, newSymbol);
                    });

                    it('should create a pool', async () => {
                        await network.createPoolT(poolCollection.address, reserveToken.address);

                        const pool = await poolCollection.poolData(reserveToken.address);

                        const poolToken = await Contracts.PoolToken.attach(pool.poolToken);
                        expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                        expect(await poolToken.symbol()).to.equal(poolTokenSymbol(newSymbol));
                        expect(await poolToken.name()).to.equal(poolTokenName(newSymbol));
                    });
                });

                context('with a token decimals override', () => {
                    const newSymbol = 'TKN2';

                    beforeEach(async () => {
                        await poolCollection.setTokenSymbolOverride(reserveToken.address, newSymbol);
                    });

                    it('should create a pool', async () => {
                        await network.createPoolT(poolCollection.address, reserveToken.address);

                        const pool = await poolCollection.poolData(reserveToken.address);

                        const poolToken = await Contracts.PoolToken.attach(pool.poolToken);
                        expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                        expect(await poolToken.symbol()).to.equal(poolTokenSymbol(newSymbol));
                        expect(await poolToken.name()).to.equal(poolTokenName(newSymbol));
                    });
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
                expect(initialRate).to.equal(INITIAL_RATE);

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
                await expect(res).to.emit(poolCollection, 'TradingEnabled').withArgs(reserveToken.address, false);

                pool = await poolCollection.poolData(reserveToken.address);
                ({ tradingEnabled } = pool);
                expect(tradingEnabled).to.be.false;

                const res2 = await poolCollection.enableTrading(reserveToken.address, true);
                await expect(res2).to.emit(poolCollection, 'TradingEnabled').withArgs(reserveToken.address, true);

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
                const { network } = await createSystem();

                poolCollection = await Contracts.TestPoolCollection.deploy(network.address);
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
                            maxErrors.baseTokenAmountToTransferFromVaultToProvider.absolute,
                            maxErrors.baseTokenAmountToTransferFromVaultToProvider.relative
                        );
                        expect(actual.networkTokenAmountToMintForProvider).to.almostEqual(
                            new Decimal(networkTokenAmountToMintForProvider),
                            maxErrors.networkTokenAmountToMintForProvider.absolute,
                            maxErrors.networkTokenAmountToMintForProvider.relative
                        );
                        expect(actual.baseTokenAmountToDeductFromLiquidity).to.almostEqual(
                            new Decimal(baseTokenAmountToDeductFromLiquidity),
                            maxErrors.baseTokenAmountToDeductFromLiquidity.absolute,
                            maxErrors.baseTokenAmountToDeductFromLiquidity.relative
                        );
                        expect(actual.baseTokenAmountToTransferFromExternalProtectionWalletToProvider).to.almostEqual(
                            new Decimal(baseTokenAmountToTransferFromExternalProtectionWalletToProvider),
                            maxErrors.baseTokenAmountToTransferFromExternalProtectionWalletToProvider.absolute,
                            maxErrors.baseTokenAmountToTransferFromExternalProtectionWalletToProvider.relative
                        );
                        expect(actual.networkTokenAmountToDeductFromLiquidity).to.almostEqual(
                            new Decimal(networkTokenAmountToDeductFromLiquidity),
                            maxErrors.networkTokenAmountToDeductFromLiquidity.absolute,
                            maxErrors.networkTokenAmountToDeductFromLiquidity.relative
                        );
                        expect(actual.networkTokenArbitrageAmount).to.almostEqual(
                            new Decimal(networkTokenArbitrageAmount),
                            maxErrors.networkTokenArbitrageAmount.absolute,
                            maxErrors.networkTokenArbitrageAmount.relative
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

    describe.skip('withdraw', () => {});
});
