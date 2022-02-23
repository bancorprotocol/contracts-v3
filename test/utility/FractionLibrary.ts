import Contracts, { TestFractionLibrary } from '../../components/Contracts';
import { MAX_UINT256 } from '../../utils/Constants';
import { toString, Fraction } from '../../utils/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const MAX_UINT112 = BigNumber.from(2).pow(112).sub(1);

describe('FractionLibrary', () => {
    let fractionLibrary: TestFractionLibrary;

    before(async () => {
        fractionLibrary = await Contracts.TestFractionLibrary.deploy();
    });

    describe('isValid(Fraction)', () => {
        for (const fraction of [
            { n: 0, d: 1 },
            { n: 1, d: 2 },
            { n: 1000, d: 2000 }
        ]) {
            it(`should return that ${toString(fraction)} is valid`, async () => {
                expect(await fractionLibrary["isValid((uint256,uint256))"](fraction)).to.be.true;
            });
        }

        for (const fraction of [
            { n: 0, d: 0 },
            { n: 1, d: 0 },
            { n: 1000, d: 0 }
        ]) {
            it(`should return that ${fraction} is invalid`, async () => {
                expect(await fractionLibrary["isValid((uint256,uint256))"](fraction)).to.be.false;
            });
        }
    });

    describe('isPositive(Fraction)', () => {
        for (const fraction of [
            { n: 1, d: 1 },
            { n: 1, d: 2 },
            { n: 1000, d: 2000 }
        ]) {
            it(`should return that ${toString(fraction)} is positive`, async () => {
                expect(await fractionLibrary["isPositive((uint256,uint256))"](fraction)).to.be.true;
            });
        }

        for (const fraction of [
            { n: 0, d: 1 },
            { n: 0, d: 1000 },
            { n: 0, d: 0 },
            { n: 1, d: 0 }
        ]) {
            it(`should return that ${toString(fraction)} is not positive`, async () => {
                expect(await fractionLibrary["isPositive((uint256,uint256))"](fraction)).to.be.false;
            });
        }
    });

    describe('isValid(Fraction112)', () => {
        for (const fraction of [
            { n: 0, d: 1 },
            { n: 1, d: 2 },
            { n: 1000, d: 2000 }
        ]) {
            it(`should return that ${toString(fraction)} is valid`, async () => {
                expect(await fractionLibrary["isValid((uint112,uint112))"](fraction)).to.be.true;
            });
        }

        for (const fraction of [
            { n: 0, d: 0 },
            { n: 1, d: 0 },
            { n: 1000, d: 0 }
        ]) {
            it(`should return that ${fraction} is invalid`, async () => {
                expect(await fractionLibrary["isValid((uint112,uint112))"](fraction)).to.be.false;
            });
        }
    });

    describe('isPositive(Fraction112)', () => {
        for (const fraction of [
            { n: 1, d: 1 },
            { n: 1, d: 2 },
            { n: 1000, d: 2000 }
        ]) {
            it(`should return that ${toString(fraction)} is positive`, async () => {
                expect(await fractionLibrary["isPositive((uint112,uint112))"](fraction)).to.be.true;
            });
        }

        for (const fraction of [
            { n: 0, d: 1 },
            { n: 0, d: 1000 },
            { n: 0, d: 0 },
            { n: 1, d: 0 }
        ]) {
            it(`should return that ${toString(fraction)} is not positive`, async () => {
                expect(await fractionLibrary["isPositive((uint112,uint112))"](fraction)).to.be.false;
            });
        }
    });

    describe('toFraction112', () => {
        const toFraction112 = (fraction: Fraction<BigNumber>, maxRelativeError: Decimal) => {
            it(`fraction = ${toString(fraction)}`, async () => {
                const newFraction = await fractionLibrary.toFraction112(fraction);
                expect(newFraction.n).to.be.lte(MAX_UINT112);
                expect(newFraction.d).to.be.lte(MAX_UINT112);
                expect(newFraction).to.almostEqual(fraction, { maxRelativeError });
            });
        };

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
    });

    describe('fromFraction112', () => {
        const fromFraction112 = (fraction: Fraction<BigNumber>) => {
            it(`fraction = ${toString(fraction)}`, async () => {
                const newFraction = await fractionLibrary.fromFraction112(fraction);
                expect(newFraction).to.equal(fraction);
            });
        };

        for (let n = 0; n < 10; n++) {
            for (let d = 0; d < 10; d++) {
                fromFraction112({ n: BigNumber.from(n), d: BigNumber.from(d) });
                fromFraction112({ n: BigNumber.from(n), d: MAX_UINT112.sub(d) });
                fromFraction112({ n: MAX_UINT112.sub(n), d: BigNumber.from(d) });
                fromFraction112({ n: MAX_UINT112.sub(n), d: MAX_UINT112.sub(d) });
            }
        }
    });
});
