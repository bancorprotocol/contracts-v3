import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber } from 'ethers';
import Decimal from 'decimal.js';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from 'components/Contracts';
import { LiquidityPoolCollection, TestLiquidityPoolCollection, TestERC20Token } from 'typechain';
import { createSystem } from 'test/helpers/Factory';
import { MAX_UINT256, PPM_RESOLUTION } from 'test/helpers/Constants';

const DEFAULT_TRADING_FEE_PPM = BigNumber.from(2000);
const POOL_TYPE = BigNumber.from(1);
const SYMBOL = 'TKN';
const EMPTY_STRING = '';

let nonOwner: SignerWithAddress;

let reserveToken: TestERC20Token;

const testFormula = (amounts: string[], fees: number[]) => {
    const MAX_VAL: string = MAX_UINT256.toString();
    const PPMR: number = PPM_RESOLUTION.toNumber();

    fees = fees.map((x) => (x * PPMR) / 100);

    let collection: TestLiquidityPoolCollection;

    before(async () => {
        const reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, 0);
        collection = await Contracts.TestLiquidityPoolCollection.deploy(reserveToken.address);
    });

    // f(f - bm - 2fm) / (fm + b)
    const baseArbitrage = (baseBalance: string, baseAmount: string, tradeFee: number) => {
        const b = new Decimal(baseBalance);
        const f = new Decimal(baseAmount);
        const m = new Decimal(tradeFee).div(PPMR);
        return f
            .mul(f.sub(b.mul(m)).sub(f.mul(m).mul(2)))
            .div(f.mul(m).add(b))
            .floor();
    };

    // af(b(2 - m) + f) / (b(b + fm))
    const networkArbitrage = (networkBalance: string, baseBalance: string, baseAmount: string, tradeFee: number) => {
        const a = new Decimal(networkBalance);
        const b = new Decimal(baseBalance);
        const f = new Decimal(baseAmount);
        const m = new Decimal(tradeFee).div(PPMR);
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
                        const actual = await collection.baseArbitrageTest(b, f, m);
                        expect(actual.toString()).to.equal(expected.toFixed());
                    } else {
                        await expect(collection.baseArbitrageTest(b, f, m)).to.be.reverted;
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
                            const actual = await collection.networkArbitrageTest(a, b, f, m);
                            expect(actual.toString()).to.equal(expected.toFixed());
                        } else {
                            await expect(collection.networkArbitrageTest(a, b, f, m)).to.be.reverted;
                        }
                    });
                }
            }
        }
    }
};

describe('LiquidityPoolCollection', () => {
    before(async () => {
        [, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        reserveToken = await Contracts.TestERC20Token.deploy(SYMBOL, SYMBOL, BigNumber.from(1_000_000));
    });

    describe('construction', async () => {
        it('should be properly initialized', async () => {
            const { collection, network } = await createSystem();

            expect(await collection.version()).to.equal(1);

            expect(await collection.poolType()).to.equal(POOL_TYPE);
            expect(await collection.network()).to.equal(network.address);
            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('token symbol overrides', async () => {
        const newSymbol = 'TKN2';
        let collection: LiquidityPoolCollection;

        beforeEach(async () => {
            ({ collection } = await createSystem());
        });

        it('should revert when a non-owner attempts to set a token symbol override', async () => {
            await expect(
                collection.connect(nonOwner).setTokenSymbolOverride(reserveToken.address, newSymbol)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be to able to set and update a token symbol override', async () => {
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);

            await collection.setTokenSymbolOverride(reserveToken.address, newSymbol);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(newSymbol);

            await collection.setTokenSymbolOverride(reserveToken.address, SYMBOL);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(SYMBOL);

            await collection.setTokenSymbolOverride(reserveToken.address, EMPTY_STRING);
            expect(await collection.tokenSymbolOverride(reserveToken.address)).to.equal(EMPTY_STRING);
        });
    });

    describe('default trading fee', async () => {
        const newDefaultTradingFree = BigNumber.from(100000);
        let collection: LiquidityPoolCollection;

        beforeEach(async () => {
            ({ collection } = await createSystem());

            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });

        it('should revert when a non-owner attempts to set the default trading fee', async () => {
            await expect(
                collection.connect(nonOwner).setDefaultTradingFeePPM(newDefaultTradingFree)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should revert when setting the default trading fee to an invalid value', async () => {
            await expect(collection.setDefaultTradingFeePPM(PPM_RESOLUTION.add(BigNumber.from(1)))).to.be.revertedWith(
                'ERR_INVALID_FEE'
            );
        });

        it('should be to able to set and update the default trading fee', async () => {
            const res = await collection.setDefaultTradingFeePPM(newDefaultTradingFree);
            await expect(res)
                .to.emit(collection, 'DefaultTradingFeePPMUpdated')
                .withArgs(DEFAULT_TRADING_FEE_PPM, newDefaultTradingFree);

            expect(await collection.defaultTradingFeePPM()).to.equal(newDefaultTradingFree);

            const res2 = await collection.setDefaultTradingFeePPM(DEFAULT_TRADING_FEE_PPM);
            await expect(res2)
                .to.emit(collection, 'DefaultTradingFeePPMUpdated')
                .withArgs(newDefaultTradingFree, DEFAULT_TRADING_FEE_PPM);

            expect(await collection.defaultTradingFeePPM()).to.equal(DEFAULT_TRADING_FEE_PPM);
        });
    });

    describe('formula sanity tests', () => {
        const AMOUNTS = [18, 21, 24].map((x) => new Decimal(10).pow(x).toFixed());
        const FEES = [0.25, 0.5, 1];
        testFormula(AMOUNTS, FEES);
    });
});

describe('@stress LiquidityPoolCollection', () => {
    const AMOUNTS1 = [12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(9).pow(x).toFixed());
    const AMOUNTS2 = [12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(10).pow(x).toFixed());
    const FEES = [0, 0.05, 0.25, 0.5, 1];
    testFormula([...AMOUNTS1, ...AMOUNTS2], FEES);
});
