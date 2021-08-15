import Contracts from '../../components/Contracts';
import { TestPoolCollection, TestERC20Token, TestBancorNetwork, NetworkSettings } from '../../typechain';
import { MAX_UINT256, ZERO_ADDRESS, INVALID_FRACTION, PPM_RESOLUTION } from '../helpers/Constants';
import { createSystem } from '../helpers/Factory';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';

const testFormula = (amounts: Decimal[], testFees: Decimal[]) => {
    const MAX_VAL = new Decimal(MAX_UINT256.toString());
    const PPMR = new Decimal(PPM_RESOLUTION.toString());

    const fees = testFees.map((x) => x.mul(PPMR).div(100));

    let poolCollection: TestPoolCollection;

    before(async () => {
        const { network } = await createSystem();
        poolCollection = await Contracts.TestPoolCollection.deploy(network.address);
    });

    // f(f - bm - 2fm) / (fm + b)
    const baseArbitrage = (baseBalance: Decimal, baseAmount: Decimal, tradeFee: Decimal) => {
        const b = baseBalance;
        const f = baseAmount;
        const m = tradeFee.div(PPMR);
        return f
            .mul(f.sub(b.mul(m)).sub(f.mul(m).mul(2)))
            .div(f.mul(m).add(b))
            .floor();
    };

    // af(b(2 - m) + f) / (b(b + fm))
    const networkArbitrage = (
        networkBalance: Decimal,
        baseBalance: Decimal,
        baseAmount: Decimal,
        tradeFee: Decimal
    ) => {
        const a = networkBalance;
        const b = baseBalance;
        const f = baseAmount;
        const m = tradeFee.div(PPMR);
        return a
            .mul(f)
            .mul(b.mul(m.sub(2).neg()).add(f))
            .div(b.mul(b.add(f.mul(m))))
            .floor();
    };

    for (const b of amounts) {
        for (const f of amounts) {
            for (const m of fees) {
                it(`baseArbitrage(${[b, f, m]})`, async () => {
                    const expected = baseArbitrage(b, f, m);
                    if (expected.gte(0) && expected.lte(MAX_VAL)) {
                        const actual = await poolCollection.baseArbitrageTest(b.toString(), f.toString(), m.toString());
                        expect(actual).to.equal(expected);
                    } else {
                        await expect(poolCollection.baseArbitrageTest(b.toString(), f.toString(), m.toString())).to.be
                            .reverted;
                    }
                });
            }
        }
    }

    for (const a of amounts) {
        for (const b of amounts) {
            for (const f of amounts) {
                for (const m of fees) {
                    it(`networkArbitrage(${[a, b, f, m]})`, async () => {
                        const expected = networkArbitrage(a, b, f, m);
                        if (expected.gte(0) && expected.lte(MAX_VAL)) {
                            const actual = await poolCollection.networkArbitrageTest(
                                a.toString(),
                                b.toString(),
                                f.toString(),
                                m.toString()
                            );
                            expect(actual).to.equal(expected);
                        } else {
                            await expect(
                                poolCollection.networkArbitrageTest(
                                    a.toString(),
                                    b.toString(),
                                    f.toString(),
                                    m.toString()
                                )
                            ).to.be.reverted;
                        }
                    });
                }
            }
        }
    }
};

describe('PoolCollection', () => {
    const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
    const POOL_TYPE = BigNumber.from(1);
    const SYMBOL = 'TKN';
    const EMPTY_STRING = '';
    const INITIAL_RATE = {
        n: BigNumber.from(0),
        d: BigNumber.from(1)
    };

    let nonOwner: SignerWithAddress;

    let reserveToken: TestERC20Token;

    before(async () => {
        [, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
    });

    describe('construction', () => {
        it('should be properly initialized', async () => {
            const { poolCollection, network } = await createSystem();

            expect(await poolCollection.version()).to.equal(1);

            expect(await poolCollection.poolType()).to.equal(POOL_TYPE);
            expect(await poolCollection.network()).to.equal(network.address);
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

        beforeEach(async () => {
            ({ poolCollection } = await createSystem());
        });

        it('should revert when a non-owner attempts to set a token symbol override', async () => {
            await expect(
                poolCollection.connect(nonOwner).setTokenSymbolOverride(reserveToken.address, newSymbol)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be to able to set and update a token symbol override', async () => {
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

        beforeEach(async () => {
            ({ network, networkSettings, poolCollection } = await createSystem());

            expect(await poolCollection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
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

        it('should be to able to set and update the default trading fee', async () => {
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
        let poolCollection: TestPoolCollection;

        const poolTokenSymbol = (symbol: string) => `bn${symbol}`;
        const poolTokenName = (symbol: string) => `Bancor ${symbol} Pool Token`;

        beforeEach(async () => {
            ({ network, networkSettings, poolCollection } = await createSystem());
        });

        it('should revert when attempting to create a pool from a non-network', async () => {
            let nonNetwork = nonOwner;

            await expect(poolCollection.connect(nonNetwork).createPool(reserveToken.address)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should revert when attempting to create a pool for a non-whitelisted token', async () => {
            await expect(network.createPoolT(poolCollection.address, reserveToken.address)).to.be.revertedWith(
                'ERR_POOL_NOT_WHITELISTED'
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

                await expect(res).to.emit(poolCollection, 'PoolCreated').withArgs(pool.poolToken, reserveToken.address);
                await expect(res)
                    .to.emit(poolCollection, 'TradingFeePPMUpdated')
                    .withArgs(reserveToken.address, BigNumber.from(0), pool.tradingFeePPM);
                await expect(res)
                    .to.emit(poolCollection, 'TradingEnabled')
                    .withArgs(reserveToken.address, pool.tradingEnabled);
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
                const reserveTokenSymbol = await reserveToken.symbol();
                expect(await poolToken.reserveToken()).to.equal(reserveToken.address);
                expect(await poolToken.symbol()).to.equal(poolTokenSymbol(reserveTokenSymbol));
                expect(await poolToken.name()).to.equal(poolTokenName(reserveTokenSymbol));

                expect(pool.tradingFeePPM).to.equal(DEFAULT_TRADING_FEE_PPM);
                expect(pool.tradingEnabled).to.be.true;
                expect(pool.depositingEnabled).to.be.true;
                expect(pool.baseTokenTradingLiquidity).to.equal(BigNumber.from(0));
                expect(pool.networkTokenTradingLiquidity).to.equal(BigNumber.from(0));
                expect(pool.averageRate.time).to.equal(BigNumber.from(0));
                expect(pool.averageRate.rate).to.equal(INITIAL_RATE);
                expect(pool.tradingLiquidityProduct).to.equal(BigNumber.from(0));
                expect(pool.stakedBalance).to.equal(BigNumber.from(0));
                expect(pool.initialRate).to.equal(INITIAL_RATE);
                expect(pool.depositLimit).to.equal(BigNumber.from(0));
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
        });
    });

    describe('pool settings', () => {
        let networkSettings: NetworkSettings;
        let network: TestBancorNetwork;
        let poolCollection: TestPoolCollection;
        let newReserveToken: TestERC20Token;

        beforeEach(async () => {
            ({ network, networkSettings, poolCollection } = await createSystem());

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

    describe('formula sanity tests', () => {
        const AMOUNTS = [18, 21, 24].map((x) => new Decimal(10).pow(x));
        const FEES = [0.25, 0.5, 1].map((x) => new Decimal(x));

        testFormula(AMOUNTS, FEES);
    });
});

describe('@stress PoolCollection', () => {
    const AMOUNTS1 = [12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(9).pow(x));
    const AMOUNTS2 = [12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(10).pow(x));
    const FEES = [0, 0.05, 0.25, 0.5, 1].map((x) => new Decimal(x));

    testFormula([...AMOUNTS1, ...AMOUNTS2], FEES);
});
