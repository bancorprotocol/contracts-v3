import Contracts, { TestMathEx } from '../../components/Contracts';
import { EXP2_INPUT_TOO_HIGH } from '../../utils/Constants';
import { Fraction, fromUint512, max, toPPM, toString, toUint512 } from '../../utils/Types';
import { Relation } from '../matchers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const MAX_UINT32 = BigNumber.from(2).pow(32).sub(1);
const MAX_UINT64 = BigNumber.from(2).pow(64).sub(1);
const MAX_UINT96 = BigNumber.from(2).pow(96).sub(1);
const MAX_UINT112 = BigNumber.from(2).pow(112).sub(1);
const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);
const MAX_UINT256 = BigNumber.from(2).pow(256).sub(1);

const TEST_ARRAY = [
    BigNumber.from(0),
    BigNumber.from(100),
    BigNumber.from(10_000),
    MAX_UINT128,
    MAX_UINT256.div(2),
    MAX_UINT256.sub(MAX_UINT128),
    MAX_UINT256
];

const mulDivFuncs = {
    mulDivF: (x: BigNumber, y: BigNumber, z: BigNumber) => x.mul(y).div(z),
    mulDivC: (x: BigNumber, y: BigNumber, z: BigNumber) => x.mul(y).add(z).sub(1).div(z)
};

const comp512Funcs = {
    gt512: (x: BigNumber, y: BigNumber) => x.gt(y),
    lt512: (x: BigNumber, y: BigNumber) => x.lt(y),
    gte512: (x: BigNumber, y: BigNumber) => x.gte(y),
    lte512: (x: BigNumber, y: BigNumber) => x.lte(y)
};

const toDecimal = (fraction: Fraction<BigNumber>) => new Decimal(fraction.n.toString()).div(fraction.d.toString());

describe('MathEx', () => {
    let mathContract: TestMathEx;

    before(async () => {
        mathContract = await Contracts.TestMathEx.deploy();
    });

    const testExp = (f: Fraction, maxRelativeError: Decimal) => {
        it(`exp2(${f.n} / ${f.d})`, async () => {
            const fVal = new Decimal(f.n).div(f.d);
            if (fVal.lt(EXP2_INPUT_TOO_HIGH)) {
                const actual = await mathContract.exp2(f);
                const expected = new Decimal(2).pow(fVal);
                await expect(actual).to.almostEqual(
                    { n: expected, d: 1 },
                    {
                        maxRelativeError,
                        relation: Relation.LesserOrEqual
                    }
                );
            } else {
                await expect(mathContract.exp2(f)).to.revertedWithError('Overflow');
            }
        });
    };

    const testTruncatedFraction = (fraction: Fraction<BigNumber>, max: BigNumber, maxRelativeError: Decimal) => {
        it(`truncatedFraction(${toString(fraction)}, ${max})`, async () => {
            const expected = toDecimal(fraction);
            const actual = await mathContract.truncatedFraction(fraction, max);
            expect(actual.n).to.lte(max);
            expect(actual.d).to.lte(max);
            expect(actual).to.almostEqual({ n: expected, d: 1 }, { maxRelativeError });
        });
    };

    const testTruncatedFractionRevert = (fraction: Fraction<BigNumber>, max: BigNumber) => {
        it(`truncatedFraction(${toString(fraction)}), ${max}) should revert`, async () => {
            await expect(mathContract.truncatedFraction(fraction, max)).to.be.revertedWithError('InvalidFraction');
        });
    };

    const testWeightedAverage = (
        fraction1: Fraction<BigNumber>,
        fraction2: Fraction<BigNumber>,
        weight1: number,
        weight2: number,
        maxRelativeError: Decimal
    ) => {
        it(`weightedAverage(${toString(fraction1)}, ${toString(fraction2)}, ${weight1}, ${weight2})`, async () => {
            const expected = toDecimal(fraction1)
                .mul(weight1)
                .add(toDecimal(fraction2).mul(weight2))
                .div(weight1 + weight2);
            const actual = await mathContract.weightedAverage(fraction1, fraction2, weight1, weight2);
            expect(actual).to.almostEqual({ n: expected, d: 1 }, { maxRelativeError });
        });
    };

    const testIsInRange = (
        baseSample: Fraction<BigNumber>,
        offsetSample: Fraction<BigNumber>,
        maxDeviation: number
    ) => {
        it(`isInRange(${toString(baseSample)}, ${toString(offsetSample)}, ${maxDeviation}%)`, async () => {
            const mid = toDecimal(offsetSample);
            const min = toDecimal(baseSample)
                .mul(100 - maxDeviation)
                .div(100);
            const max = toDecimal(baseSample)
                .mul(100 + maxDeviation)
                .div(100);
            const expected = min.lte(mid) && mid.lte(max);
            const actual = await mathContract.isInRange(baseSample, offsetSample, toPPM(maxDeviation));
            expect(actual).to.equal(expected);
        });
    };

    const testMulDiv = (x: BigNumber, y: BigNumber, z: BigNumber) => {
        for (const funcName in mulDivFuncs) {
            it(`${funcName}(${x}, ${y}, ${z})`, async () => {
                const expectedFunc = (mulDivFuncs as any)[funcName];
                const actualFunc = (mathContract as any)[funcName];
                const expected = expectedFunc(x, y, z);
                if (expected.lte(MAX_UINT256)) {
                    const actual = await actualFunc(x, y, z);
                    expect(actual).to.equal(expected);
                } else {
                    await expect(actualFunc(x, y, z)).to.be.revertedWithError('Overflow');
                }
            });
        }
    };

    const testSubMax0 = (x: BigNumber, y: BigNumber) => {
        it(`subMax0(${x}, ${y})`, async () => {
            const expected = max(x.sub(y), 0);
            const actual = await mathContract.subMax0(x, y);
            expect(actual).to.equal(expected);
        });
    };

    const testMul512 = (x: BigNumber, y: BigNumber) => {
        it(`mul512(${x}, ${y})`, async () => {
            const expected = x.mul(y);
            const actual = await mathContract.mul512(x, y);
            expect(fromUint512(actual)).to.equal(expected);
        });
    };

    const testComp512 = (a: BigNumber, b: BigNumber) => {
        for (const x of [a, a.add(1).mul(b)]) {
            for (const y of [b, b.add(1).mul(a)]) {
                for (const funcName in comp512Funcs) {
                    it(`${funcName}(${x}, ${y})`, async () => {
                        const expectedFunc = (comp512Funcs as any)[funcName];
                        const actualFunc = (mathContract as any)[funcName];
                        const expected = expectedFunc(x, y);
                        const actual = await actualFunc(toUint512(x), toUint512(y));
                        expect(actual).to.equal(expected);
                    });
                }
            }
        }
    };

    describe('quick tests', () => {
        for (let n = 0; n < 10; n++) {
            for (let d = 1; d < 10; d++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000006'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = 1; n <= 10; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000002'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = d - 10; n <= d - 1; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000003'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = d + 1; n <= d + 10; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000003'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = 2 * d - 10; n <= 2 * d - 1; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000004'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = 2 * d + 1; n <= 2 * d + 10; n++) {
                testExp({ n, d }, new Decimal('0.00000000000000000000000000000000000003'));
            }
        }

        for (let d = 1000; d < 1000000000; d *= 10) {
            for (let n = EXP2_INPUT_TOO_HIGH.mul(d).sub(10); n.lte(EXP2_INPUT_TOO_HIGH.mul(d).sub(1)); n = n.add(1)) {
                testExp({ n: n.floor().toNumber(), d }, new Decimal('0.000000000000000000000000000000000002'));
            }
        }

        for (const max of [MAX_UINT128]) {
            for (let n = 0; n < 10; n++) {
                for (let d = 0; d < 10; d++) {
                    testTruncatedFraction({ n: max.sub(n), d: max.sub(d) }, max, new Decimal('0'));
                    testTruncatedFraction(
                        { n: max.sub(n), d: max.add(d) },
                        max,
                        new Decimal('0.000000000000000000000000000000000000003')
                    );
                    testTruncatedFraction(
                        { n: max.add(n), d: max.sub(d) },
                        max,
                        new Decimal('0.000000000000000000000000000000000000003')
                    );
                    testTruncatedFraction(
                        { n: max.add(n), d: max.add(d) },
                        max,
                        new Decimal('0.000000000000000000000000000000000000003')
                    );
                }
            }
        }

        for (const n of [100, 200]) {
            for (const d of [2, 3]) {
                for (const max of [3, 5]) {
                    testTruncatedFractionRevert({ n: BigNumber.from(n), d: BigNumber.from(d) }, BigNumber.from(max));
                }
            }
        }

        for (const n of [MAX_UINT64, MAX_UINT96]) {
            for (const d of [MAX_UINT64, MAX_UINT96]) {
                const fraction1 = { n, d };
                for (const n of [MAX_UINT64, MAX_UINT96]) {
                    for (const d of [MAX_UINT64, MAX_UINT96]) {
                        const fraction2 = { n, d };
                        for (const weight1 of [2, 8]) {
                            for (const weight2 of [2, 8]) {
                                testWeightedAverage(fraction1, fraction2, weight1, weight2, new Decimal('5e-155'));
                            }
                        }
                    }
                }
            }
        }

        for (const n of [MAX_UINT64, MAX_UINT96]) {
            for (const d of [MAX_UINT64, MAX_UINT96]) {
                const baseSample = { n, d };
                for (const n of [MAX_UINT64, MAX_UINT96]) {
                    for (const d of [MAX_UINT64, MAX_UINT96]) {
                        const offsetSample = { n, d };
                        for (const maxDeviation of [2, 5]) {
                            testIsInRange(baseSample, offsetSample, maxDeviation);
                        }
                    }
                }
            }
        }

        for (const px of [128, 192, 256]) {
            for (const py of [128, 192, 256]) {
                for (const pz of [128, 192, 256]) {
                    for (const ax of [3, 5, 7]) {
                        for (const ay of [3, 5, 7]) {
                            for (const az of [3, 5, 7]) {
                                const x = BigNumber.from(2).pow(px).div(ax);
                                const y = BigNumber.from(2).pow(py).div(ay);
                                const z = BigNumber.from(2).pow(pz).div(az);
                                testMulDiv(x, y, z);
                            }
                        }
                    }
                }
            }
        }

        for (const x of TEST_ARRAY) {
            for (const y of TEST_ARRAY) {
                testSubMax0(x, y);
                testMul512(x, y);
                testComp512(x, y);
            }
        }
    });

    describe('@stress tests', () => {
        for (let n = 0; n < 100; n++) {
            for (let d = 1; d < 100; d++) {
                testExp({ n, d }, new Decimal('0.000000000000000000000000000000000002'));
            }
        }

        for (const max of [MAX_UINT96, MAX_UINT112, MAX_UINT128]) {
            for (let n = 0; n < 10; n++) {
                for (let d = 0; d < 10; d++) {
                    testTruncatedFraction({ n: max.sub(n), d: max.sub(d) }, max, new Decimal('0'));
                    testTruncatedFraction(
                        { n: max.sub(n), d: max.add(d) },
                        max,
                        new Decimal('0.00000000000000000000000000002')
                    );
                    testTruncatedFraction(
                        { n: max.add(n), d: max.sub(d) },
                        max,
                        new Decimal('0.00000000000000000000000000002')
                    );
                    testTruncatedFraction(
                        { n: max.add(n), d: max.add(d) },
                        max,
                        new Decimal('0.00000000000000000000000000002')
                    );
                }
            }
        }

        for (const max of [MAX_UINT112]) {
            for (let i = BigNumber.from(1); i.lte(max); i = i.mul(10)) {
                for (let j = BigNumber.from(1); j.lte(max); j = j.mul(10)) {
                    const n = MAX_UINT256.div(max).mul(i).add(1);
                    const d = MAX_UINT256.div(max).mul(j).add(1);
                    testTruncatedFraction({ n, d }, max, new Decimal('0.04'));
                }
            }
        }

        for (const max of [MAX_UINT96, MAX_UINT112, MAX_UINT128]) {
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
                                testTruncatedFraction({ n, d }, max, new Decimal('0.0000000005'));
                            }
                        }
                    }
                }
            }
        }

        for (const n of [0, 1, 2, 3]) {
            for (const d of [1, 2, 3, 4]) {
                const fraction1 = { n: BigNumber.from(n), d: BigNumber.from(d) };
                for (const n of [0, 1, 2, 3]) {
                    for (const d of [1, 2, 3, 4]) {
                        const fraction2 = { n: BigNumber.from(n), d: BigNumber.from(d) };
                        for (const weight1 of [1, 2, 4, 8]) {
                            for (const weight2 of [1, 2, 4, 8]) {
                                testWeightedAverage(fraction1, fraction2, weight1, weight2, new Decimal('1e-154'));
                            }
                        }
                    }
                }
            }
        }

        for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
            for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                const fraction1 = { n, d };
                for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                    for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                        const fraction2 = { n, d };
                        for (const weight1 of [1, 2, 4, 8]) {
                            for (const weight2 of [1, 2, 4, 8]) {
                                testWeightedAverage(fraction1, fraction2, weight1, weight2, new Decimal('2e-154'));
                            }
                        }
                    }
                }
            }
        }

        for (const n of [0, 1, 2, 3]) {
            for (const d of [1, 2, 3, 4]) {
                const baseSample = { n: BigNumber.from(n), d: BigNumber.from(d) };
                for (const n of [0, 1, 2, 3]) {
                    for (const d of [1, 2, 3, 4]) {
                        const offsetSample = { n: BigNumber.from(n), d: BigNumber.from(d) };
                        for (const maxDeviation of [0, 2, 5, 10]) {
                            testIsInRange(baseSample, offsetSample, maxDeviation);
                        }
                    }
                }
            }
        }

        for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
            for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                const baseSample = { n, d };
                for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                    for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                        const offsetSample = { n, d };
                        for (const maxDeviation of [0, 2, 5, 10]) {
                            testIsInRange(baseSample, offsetSample, maxDeviation);
                        }
                    }
                }
            }
        }

        for (const px of [0, 64, 128, 192, 255, 256]) {
            for (const py of [0, 64, 128, 192, 255, 256]) {
                for (const pz of [1, 64, 128, 192, 255, 256]) {
                    for (const ax of px < 256 ? [-1, 0, +1] : [-1]) {
                        for (const ay of py < 256 ? [-1, 0, +1] : [-1]) {
                            for (const az of pz < 256 ? [-1, 0, +1] : [-1]) {
                                const x = BigNumber.from(2).pow(px).add(ax);
                                const y = BigNumber.from(2).pow(py).add(ay);
                                const z = BigNumber.from(2).pow(pz).add(az);
                                testMulDiv(x, y, z);
                            }
                        }
                    }
                }
            }
        }

        for (const px of [64, 128, 192, 256]) {
            for (const py of [64, 128, 192, 256]) {
                for (const pz of [64, 128, 192, 256]) {
                    for (const ax of [BigNumber.from(2).pow(px >> 1), 1]) {
                        for (const ay of [BigNumber.from(2).pow(py >> 1), 1]) {
                            for (const az of [BigNumber.from(2).pow(pz >> 1), 1]) {
                                const x = BigNumber.from(2).pow(px).sub(ax);
                                const y = BigNumber.from(2).pow(py).sub(ay);
                                const z = BigNumber.from(2).pow(pz).sub(az);
                                testMulDiv(x, y, z);
                            }
                        }
                    }
                }
            }
        }

        for (const px of [128, 192, 256]) {
            for (const py of [128, 192, 256]) {
                for (const pz of [128, 192, 256]) {
                    for (const ax of [3, 5, 7]) {
                        for (const ay of [3, 5, 7]) {
                            for (const az of [3, 5, 7]) {
                                const x = BigNumber.from(2).pow(px).div(ax);
                                const y = BigNumber.from(2).pow(py).div(ay);
                                const z = BigNumber.from(2).pow(pz).div(az);
                                testMulDiv(x, y, z);
                            }
                        }
                    }
                }
            }
        }
    });
});
