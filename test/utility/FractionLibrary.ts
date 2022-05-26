import Contracts, { TestFractionLibrary } from '../../components/Contracts';
import { MAX_UINT256 } from '../../utils/Constants';
import { Fraction, toString } from '../../utils/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const MAX_UINT112 = BigNumber.from(2).pow(112).sub(1);

describe('FractionLibrary', () => {
    let fractionLibrary: TestFractionLibrary;

    before(async () => {
        fractionLibrary = await Contracts.TestFractionLibrary.deploy();
    });

    it('should return the zero fractions', async () => {
        const zeroFraction = await fractionLibrary.zeroFraction();
        expect(zeroFraction.n).to.equal(0);
        expect(zeroFraction.d).to.equal(1);

        const zeroFraction112 = await fractionLibrary.zeroFraction112();
        expect(zeroFraction112.n).to.equal(0);
        expect(zeroFraction112.d).to.equal(1);
    });

    const isValid256 = (fraction: Fraction<BigNumber>, expected: boolean) => {
        it(`isValid256(${toString(fraction)}) should return ${expected}`, async () => {
            expect(await fractionLibrary.isValid256(fraction)).to.equal(expected);
        });
    };

    const isValid112 = (fraction: Fraction<BigNumber>, expected: boolean) => {
        it(`isValid112(${toString(fraction)}) should return ${expected}`, async () => {
            expect(await fractionLibrary.isValid112(fraction)).to.equal(expected);
        });
    };

    const isPositive256 = (fraction: Fraction<BigNumber>, expected: boolean) => {
        it(`isPositive256(${toString(fraction)}) should return ${expected}`, async () => {
            expect(await fractionLibrary.isPositive256(fraction)).to.equal(expected);
        });
    };

    const isPositive112 = (fraction: Fraction<BigNumber>, expected: boolean) => {
        it(`isPositive112(${toString(fraction)}) should return ${expected}`, async () => {
            expect(await fractionLibrary.isPositive112(fraction)).to.equal(expected);
        });
    };

    const toFraction112 = (fraction: Fraction<BigNumber>, maxRelativeError: Decimal) => {
        it(`toFraction112(${toString(fraction)})`, async () => {
            const newFraction = await fractionLibrary.toFraction112(fraction);
            expect(newFraction.n).to.be.lte(MAX_UINT112);
            expect(newFraction.d).to.be.lte(MAX_UINT112);
            expect(newFraction).to.almostEqual(fraction, { maxRelativeError });
        });
    };

    const fromFraction112 = (fraction: Fraction<BigNumber>) => {
        it(`fromFraction112(${toString(fraction)})`, async () => {
            expect(await fractionLibrary.fromFraction112(fraction)).to.equal(fraction);
        });
    };

    const inverse256 = (fraction: Fraction<BigNumber>) => {
        it(`inverse256(${toString(fraction)})`, async () => {
            if (fraction.n.isZero()) {
                await expect(fractionLibrary.inverse256(fraction)).to.be.revertedWithError('InvalidFraction');
            } else {
                expect(await fractionLibrary.inverse256(fraction)).to.equal({ n: fraction.d, d: fraction.n });
            }
        });
    };

    const inverse112 = (fraction: Fraction<BigNumber>) => {
        it(`inverse112(${toString(fraction)})`, async () => {
            if (fraction.n.isZero()) {
                await expect(fractionLibrary.inverse112(fraction)).to.be.revertedWithError('InvalidFraction');
            } else {
                expect(await fractionLibrary.inverse112(fraction)).to.equal({ n: fraction.d, d: fraction.n });
            }
        });
    };

    for (const n of [0, 1, 2, 1000, 2000, MAX_UINT112]) {
        for (const d of [0, 1, 2, 1000, 2000, MAX_UINT112]) {
            const fraction = { n: BigNumber.from(n), d: BigNumber.from(d) };
            isValid256(fraction, !fraction.d.eq(0));
            isValid112(fraction, !fraction.d.eq(0));
            isPositive256(fraction, !fraction.n.eq(0) && !fraction.d.eq(0));
            isPositive112(fraction, !fraction.n.eq(0) && !fraction.d.eq(0));
            inverse256(fraction);
            inverse112(fraction);
        }
    }

    for (let n = 0; n < 10; n++) {
        for (let d = 0; d < 10; d++) {
            toFraction112({ n: MAX_UINT112.sub(n), d: MAX_UINT112.sub(d) }, new Decimal('0'));
            toFraction112(
                { n: MAX_UINT112.sub(n), d: MAX_UINT112.add(d) },
                new Decimal('0.0000000000000000000000000000000002')
            );
            toFraction112(
                { n: MAX_UINT112.add(n), d: MAX_UINT112.sub(d) },
                new Decimal('0.0000000000000000000000000000000002')
            );
            toFraction112(
                { n: MAX_UINT112.add(n), d: MAX_UINT112.add(d) },
                new Decimal('0.0000000000000000000000000000000002')
            );
        }
    }

    for (let i = BigNumber.from(1); i.lte(MAX_UINT112); i = i.mul(10)) {
        for (let j = BigNumber.from(1); j.lte(MAX_UINT112); j = j.mul(10)) {
            const n = MAX_UINT256.div(MAX_UINT112).mul(i).add(1);
            const d = MAX_UINT256.div(MAX_UINT112).mul(j).add(1);
            toFraction112({ n, d }, new Decimal('0.04'));
        }
    }

    for (let i = 96; i <= 256; i += 16) {
        for (let j = i - 64; j <= i + 64; j += 16) {
            const iMax = BigNumber.from(2).pow(i).sub(1);
            const jMax = BigNumber.from(2).pow(j).sub(1);
            for (const n of [
                iMax.div(3),
                iMax.div(2),
                iMax.mul(2).div(3),
                iMax.mul(3).div(4),
                iMax.sub(1),
                iMax,
                iMax.add(1),
                iMax.mul(4).div(3),
                iMax.mul(3).div(2),
                iMax.mul(2),
                iMax.mul(3)
            ]) {
                for (const d of [jMax.sub(1), jMax, jMax.add(1)]) {
                    if (n.lte(MAX_UINT256) && d.lte(MAX_UINT256)) {
                        toFraction112({ n, d }, new Decimal('0.000000000000008'));
                    }
                }
            }
        }
    }

    for (let n = 0; n < 10; n++) {
        for (let d = 0; d < 10; d++) {
            fromFraction112({ n: BigNumber.from(n), d: BigNumber.from(d) });
            fromFraction112({ n: BigNumber.from(n), d: MAX_UINT112.sub(d) });
            fromFraction112({ n: MAX_UINT112.sub(n), d: BigNumber.from(d) });
            fromFraction112({ n: MAX_UINT112.sub(n), d: MAX_UINT112.sub(d) });
        }
    }
});
