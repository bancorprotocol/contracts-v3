import { expect } from 'chai';
import { BigNumber } from 'ethers';
import Decimal from 'decimal.js';

import Contracts from 'components/Contracts';
import { TestMathEx } from 'typechain';

import MathUtils from 'test/helpers/MathUtils';

const { floorSqrt, ceilSqrt, productRatio, reducedRatio, normalizedRatio, accurateRatio, roundDiv } = MathUtils;

const MAX_UINT128 = new Decimal(2).pow(128).sub(1);
const MAX_UINT256 = new Decimal(2).pow(256).sub(1);
const SCALES = [6, 18, 30].map((n) => new Decimal(10).pow(n)).concat(MAX_UINT128);
const PR_TEST_ARRAY = [MAX_UINT128, MAX_UINT256.divToInt(2), MAX_UINT256.sub(MAX_UINT128), MAX_UINT256];
const PR_MAX_ERROR = new Decimal('0.00000000000000000000000000000000000001');

const expectEqual = (
    actual: BigNumber,
    expected: Decimal
) => {
    expect(actual.toString()).to.equal(expected.toFixed());
};

const expectAlmostEqual = (
    actual: [BigNumber, BigNumber],
    expected: Decimal[],
    maxAbsoluteError: Decimal,
    maxRelativeError: Decimal
) => {
    const x = expected[0].mul(actual[1].toString());
    const y = expected[1].mul(actual[0].toString());
    if (!x.eq(y)) {
        const absoluteError = x.sub(y).abs();
        const relativeError = x.div(y).sub(1).abs();
        expect(absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError)).to.equal(
            true,
            `\nabsoluteError = ${absoluteError.toFixed()}\nrelativeError = ${relativeError.toFixed(25)}`
        );
    }
};

describe.only('MathEx', () => {
    let mathContract: TestMathEx;

    before(async () => {
        mathContract = await Contracts.TestMathEx.deploy();
    });

    const floorSqrtTest = (n: number, k: number) => {
        const x = BigNumber.from(2).pow(BigNumber.from(n)).add(BigNumber.from(k)).toHexString();
        it(`floorSqrt(${x})`, async () => {
            const expected = floorSqrt(x);
            const actual = await mathContract.floorSqrtTest(x);
            expectEqual(actual, expected);
        });
    };
    
    const ceilSqrtTest = (n: number, k: number) => {
        const x = BigNumber.from(2).pow(BigNumber.from(n)).add(BigNumber.from(k)).toHexString();
        it(`ceilSqrt(${x})`, async () => {
            const expected = ceilSqrt(x);
            const actual = await mathContract.ceilSqrtTest(x);
            expectEqual(actual, expected);
        });
    };
    
    const productRatioTest = (xn: Decimal, yn: Decimal, xd: Decimal, yd: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        const [an, bn, ad, bd] = [xn, yn, xd, yd].map((val) => val.toHex());
        it(`productRatio(${[an, bn, ad, bd]})`, async () => {
            const expected = productRatio(an, bn, ad, bd);
            const actual = await mathContract.productRatioTest(an, bn, ad, bd);
            expectAlmostEqual(actual, expected, maxAbsoluteError, maxRelativeError);
        });
    };
    
    const reducedRatioTest = (x: Decimal, y: Decimal, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        const [a, b, max] = [x, y, scale].map((val) => val.toHex());
        it(`reducedRatio(${[a, b, max]})`, async () => {
            const expected = reducedRatio(a, b, max);
            const actual = await mathContract.reducedRatioTest(a, b, max);
            expectAlmostEqual(actual, expected, maxAbsoluteError, maxRelativeError);
        });
    };
    
    const normalizedRatioTest = (x: Decimal, y: Decimal, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        const [a, b, max] = [x, y, scale].map((val) => val.toHex());
        it(`normalizedRatio(${[a, b, max]})`, async () => {
            const expected = normalizedRatio(a, b, max);
            const actual = await mathContract.normalizedRatioTest(a, b, max);
            expectAlmostEqual(actual, expected, maxAbsoluteError, maxRelativeError);
        });
    };
    
    const accurateRatioTest = (x: Decimal, y: Decimal, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        const [a, b, max] = [x, y, scale].map((val) => val.toHex());
        it(`accurateRatio(${[a, b, max]})`, async () => {
            const expected = accurateRatio(a, b, max);
            const actual = await mathContract.accurateRatioTest(a, b, max);
            expectAlmostEqual(actual, expected, maxAbsoluteError, maxRelativeError);
        });
    };
    
    const roundDivTest = (x: Decimal, y: Decimal) => {
        const [n, d] = [x, y].map((val) => val.toFixed());
        it(`roundDiv(${n}, ${d})`, async () => {
            const expected = roundDiv(n, d);
            const actual = await mathContract.roundDivTest(n, d);
            expectEqual(actual, expected);
        });
    };
    
    const geometricMeanTest = (xs: Decimal[]) => {
        const values = xs.map((val) => val.toFixed());
        it(`geometricMean([${values}])`, async () => {
            const expected = new Decimal(10).pow(Math.round(values.join('').length / values.length) - 1);
            const actual = await mathContract.geometricMeanTest(values);
            expectEqual(actual, expected);
        });
    };
    
    const decimalLengthTest = (n: number, k: number) => {
        const x = BigNumber.from(2).pow(BigNumber.from(n)).add(BigNumber.from(k)).toString();
        it(`decimalLength(${x})`, async () => {
            const expected = new Decimal(x.length);
            const actual = await mathContract.decimalLengthTest(x);
            expectEqual(actual, expected);
        });
    };
    
    const roundDivUnsafeTest = (x: Decimal, y: Decimal) => {
        const [n, d] = [x, y].map((val) => val.toFixed());
        it(`roundDivUnsafe(${[n, d]})`, async () => {
            const expected = roundDiv(n, d);
            const actual = await mathContract.roundDivUnsafeTest(n, d);
            expectEqual(actual, expected);
        });
    };
    
    type MulDivFunction = 'mulDivC' | 'mulDivF';
    const mulDivTest = (methodName: MulDivFunction, x: Decimal, y: Decimal, z: Decimal) => {
        const [a, b, c] = [x, y, z].map((val) => val.toHex());
        it(`${methodName}(${[a, b, c]})`, async () => {
            const expected = MathUtils[methodName](a, b, c);
            if (expected.lte(MAX_UINT256)) {
                const actual = await mathContract[methodName](a, b, c);
                expectEqual(actual, expected);
            } else {
                await expect(mathContract[methodName](a, b, c)).to.be.revertedWith('ERR_OVERFLOW');
            }
        });
    };
        
    context('quick tests', () => {
        for (const n of [1, 64, 128, 192, 256]) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                floorSqrtTest(n, k);
            }
        }

        for (const n of [1, 64, 128, 192, 256]) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                ceilSqrtTest(n, k);
            }
        }

        for (const xn of PR_TEST_ARRAY.slice(-2)) {
            for (const yn of PR_TEST_ARRAY.slice(-2)) {
                for (const xd of PR_TEST_ARRAY.slice(-2)) {
                    for (const yd of PR_TEST_ARRAY.slice(-2)) {
                        productRatioTest(xn, yn, xd, yd, new Decimal(0), PR_MAX_ERROR);
                    }
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = 1; b <= 5; b++) {
                    reducedRatioTest(new Decimal(a), new Decimal(b), scale, new Decimal(0), new Decimal(0));
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = 1; b <= 5; b++) {
                    normalizedRatioTest(new Decimal(a), new Decimal(b), scale, new Decimal(0), new Decimal('0.00000241'));
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = Math.max(a, 1); b <= 5; b++) {
                    accurateRatioTest(new Decimal(a), new Decimal(b), scale, new Decimal(0), new Decimal('0.0000024'));
                }
            }
        }

        for (let n = 0; n < 5; n++) {
            for (let d = 1; d <= 5; d++) {
                roundDivTest(new Decimal(n), new Decimal(d));
            }
        }

        for (const values of [
            [123, 456789],
            [12, 345, 6789]
        ]) {
            geometricMeanTest(values.map((x) => new Decimal(x)));
        }

        for (const n of [11, 33, 55, 77]) {
            for (const k of [-1, 0, +1]) {
                decimalLengthTest(n, k);
            }
        }

        for (let n = 0; n < 5; n++) {
            for (let d = 1; d <= 5; d++) {
                roundDivUnsafeTest(new Decimal(n), new Decimal(d));
            }
        }

        for (const methodName of ['mulDivF', 'mulDivC']) {
            for (const px of [128, 192, 256]) {
                for (const py of [128, 192, 256]) {
                    for (const pz of [128, 192, 256]) {
                        for (const ax of [3, 5, 7]) {
                            for (const ay of [3, 5, 7]) {
                                for (const az of [3, 5, 7]) {
                                    const x = new Decimal(2).pow(px).divToInt(ax);
                                    const y = new Decimal(2).pow(py).divToInt(ay);
                                    const z = new Decimal(2).pow(pz).divToInt(az);
                                    mulDivTest(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
        
    context('@stress tests', () => {
        for (let n = 1; n <= 256; n++) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                floorSqrtTest(n, k);
            }
        }

        for (let n = 1; n <= 256; n++) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                ceilSqrtTest(n, k);
            }
        }

        for (const xn of PR_TEST_ARRAY) {
            for (const yn of PR_TEST_ARRAY) {
                for (const xd of PR_TEST_ARRAY) {
                    for (const yd of PR_TEST_ARRAY) {
                        productRatioTest(xn, yn, xd, yd, new Decimal(0), PR_MAX_ERROR);
                    }
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = 1; b <= 10; b++) {
                    reducedRatioTest(new Decimal(a), new Decimal(b), scale, new Decimal(0), new Decimal(0));
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(1); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    reducedRatioTest(a, b, scale, new Decimal(0), new Decimal('0.135'));
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = 1; b <= 10; b++) {
                    normalizedRatioTest(new Decimal(a), new Decimal(b), scale, new Decimal(0), new Decimal('0.00000241'));
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(1); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    normalizedRatioTest(a, b, scale, new Decimal(0), new Decimal('0.135'));
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = Math.max(a, 1); b <= 10; b++) {
                    accurateRatioTest(new Decimal(a), new Decimal(b), scale, new Decimal(0), new Decimal('0.0000024'));
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(i); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    accurateRatioTest(a, b, scale, new Decimal(0), new Decimal('0.135'));
                }
            }
        }

        for (const scale of [1, 2, 3, 4].map((x) => new Decimal(x))) {
            for (const a of [
                MAX_UINT256.div(3).floor(),
                MAX_UINT256.div(3).ceil(),
                MAX_UINT256.div(2).floor(),
                MAX_UINT256.div(2).ceil(),
                MAX_UINT256.mul(2).div(3).floor(),
                MAX_UINT256.mul(2).div(3).ceil(),
                MAX_UINT256.mul(3).div(4).floor(),
                MAX_UINT256.mul(3).div(4).ceil(),
                MAX_UINT256.sub(1),
                MAX_UINT256
            ]) {
                for (const b of [MAX_UINT256.sub(1), MAX_UINT256].filter((b) => b.gt(a))) {
                    accurateRatioTest(a, b, scale, new Decimal('1.6'), new Decimal(0));
                }
            }
        }

        for (let n = 0; n < 10; n++) {
            for (let d = 1; d <= 10; d++) {
                roundDivTest(new Decimal(n), new Decimal(d));
            }
        }

        for (const values of [
            [123, 456789],
            [12, 345, 6789],
            [1, 1000, 1000000, 1000000000, 1000000000000]
        ]) {
            geometricMeanTest(values.map((x) => new Decimal(x)));
        }

        for (let n = 1; n <= 77; n++) {
            for (const k of [-1, 0, +1]) {
                decimalLengthTest(n, k);
            }
        }

        for (let n = 0; n < 10; n++) {
            for (let d = 1; d <= 10; d++) {
                roundDivUnsafeTest(new Decimal(n), new Decimal(d));
            }
        }

        for (const methodName of ['mulDivF', 'mulDivC']) {
            for (const px of [0, 64, 128, 192, 255, 256]) {
                for (const py of [0, 64, 128, 192, 255, 256]) {
                    for (const pz of [1, 64, 128, 192, 255, 256]) {
                        for (const ax of px < 256 ? [-1, 0, +1] : [-1]) {
                            for (const ay of py < 256 ? [-1, 0, +1] : [-1]) {
                                for (const az of pz < 256 ? [-1, 0, +1] : [-1]) {
                                    const x = new Decimal(2).pow(px).add(ax);
                                    const y = new Decimal(2).pow(py).add(ay);
                                    const z = new Decimal(2).pow(pz).add(az);
                                    mulDivTest(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const methodName of ['mulDivF', 'mulDivC']) {
            for (const px of [64, 128, 192, 256]) {
                for (const py of [64, 128, 192, 256]) {
                    for (const pz of [64, 128, 192, 256]) {
                        for (const ax of [new Decimal(2).pow(px >> 1), 1]) {
                            for (const ay of [new Decimal(2).pow(py >> 1), 1]) {
                                for (const az of [new Decimal(2).pow(pz >> 1), 1]) {
                                    const x = new Decimal(2).pow(px).sub(ax);
                                    const y = new Decimal(2).pow(py).sub(ay);
                                    const z = new Decimal(2).pow(pz).sub(az);
                                    mulDivTest(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const methodName of ['mulDivF', 'mulDivC']) {
            for (const px of [128, 192, 256]) {
                for (const py of [128, 192, 256]) {
                    for (const pz of [128, 192, 256]) {
                        for (const ax of [3, 5, 7]) {
                            for (const ay of [3, 5, 7]) {
                                for (const az of [3, 5, 7]) {
                                    const x = new Decimal(2).pow(px).divToInt(ax);
                                    const y = new Decimal(2).pow(py).divToInt(ay);
                                    const z = new Decimal(2).pow(pz).divToInt(az);
                                    mulDivTest(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
});
