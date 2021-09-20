import Contracts from '../../components/Contracts';
import { TestMathEx } from '../../typechain';
import {
    floorSqrt,
    ceilSqrt,
    productRatio,
    reducedRatio,
    normalizedRatio,
    accurateRatio,
    roundDiv,
    mulDivC,
    mulDivF
} from '../helpers/MathUtils';
import { Fraction, toBigNumber, toString } from '../helpers/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const MAX_UINT128 = new Decimal(2).pow(128).sub(1);
const MAX_UINT256 = new Decimal(2).pow(256).sub(1);
const SCALES = [6, 18, 30].map((n) => new Decimal(10).pow(n)).concat(MAX_UINT128);
const PR_TEST_ARRAY = [MAX_UINT128, MAX_UINT256.divToInt(2), MAX_UINT256.sub(MAX_UINT128), MAX_UINT256];
const PR_MAX_ERROR = new Decimal('0.00000000000000000000000000000000000001');

describe('MathEx', () => {
    let mathContract: TestMathEx;

    before(async () => {
        mathContract = await Contracts.TestMathEx.deploy();
    });

    const testFloorSqrt = (n: number, k: number) => {
        const x = BigNumber.from(2).pow(BigNumber.from(n)).add(BigNumber.from(k));
        it(`floorSqrt(${x.toHexString()})`, async () => {
            const expected = floorSqrt(x);
            const actual = await mathContract.floorSqrt(x);
            expect(actual).to.equal(expected);
        });
    };

    const testCeilSqrt = (n: number, k: number) => {
        const x = BigNumber.from(2).pow(BigNumber.from(n)).add(BigNumber.from(k));
        it(`ceilSqrt(${x.toHexString()})`, async () => {
            const expected = ceilSqrt(x);
            const actual = await mathContract.ceilSqrt(x);
            expect(actual).to.equal(expected);
        });
    };

    const testProductRatio = (x: Fraction, y: Fraction, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        it(`productRatio(${toString(x)}, ${toString(y)}`, async () => {
            const expected = productRatio(x, y);
            const actual = await mathContract.productRatio(toBigNumber(x), toBigNumber(y));
            expect(expected).to.almostEqual({ n: actual[0], d: actual[1] }, maxAbsoluteError, maxRelativeError);
        });
    };

    const testReducedRatio = (r: Fraction, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        it(`reducedRatio(${toString(r)}, ${scale.toString()}})`, async () => {
            const expected = reducedRatio(r, scale);
            const actual = await mathContract.reducedRatio(toBigNumber(r), toBigNumber(scale));
            expect(expected).to.almostEqual({ n: actual[0], d: actual[1] }, maxAbsoluteError, maxRelativeError);
        });
    };

    const testNormalizedRatio = (r: Fraction, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        it(`normalizedRatio(${toString(r)}, ${scale.toString()}})`, async () => {
            const expected = normalizedRatio(r, scale);
            const actual = await mathContract.normalizedRatio(toBigNumber(r), toBigNumber(scale));
            expect(expected).to.almostEqual({ n: actual[0], d: actual[1] }, maxAbsoluteError, maxRelativeError);
        });
    };

    const testAccurateRatio = (r: Fraction, scale: Decimal, maxAbsoluteError: Decimal, maxRelativeError: Decimal) => {
        it(`accurateRatio(${toString(r)}, ${scale.toString()}})`, async () => {
            const expected = accurateRatio(r, scale);
            const actual = await mathContract.accurateRatio(toBigNumber(r), toBigNumber(scale));
            expect(expected).to.almostEqual({ n: actual[0], d: actual[1] }, maxAbsoluteError, maxRelativeError);
        });
    };

    const testRoundDiv = (x: Decimal, y: Decimal) => {
        const [n, d] = [x, y].map((val) => val.toFixed());
        it(`roundDiv(${n}, ${d})`, async () => {
            const expected = roundDiv(n, d);
            const actual = await mathContract.roundDiv(n, d);
            expect(actual).to.equal(expected);
        });
    };

    type MulDivFunction = 'mulDivC' | 'mulDivF';
    const testMulDiv = (methodName: MulDivFunction, x: Decimal, y: Decimal, z: Decimal) => {
        const [a, b, c] = [x, y, z].map((val) => val.toHex());
        it(`${methodName}(${[a, b, c]})`, async () => {
            const expected = (methodName === 'mulDivC' ? mulDivC : mulDivF)(a, b, c);
            if (expected.lte(MAX_UINT256)) {
                const actual = await mathContract[methodName](a, b, c);
                expect(actual).to.equal(expected);
            } else {
                await expect(mathContract[methodName](a, b, c)).to.be.revertedWith('ERR_OVERFLOW');
            }
        });
    };

    describe('quick tests', () => {
        for (const n of [1, 64, 128, 192, 256]) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testFloorSqrt(n, k);
            }
        }

        for (const n of [1, 64, 128, 192, 256]) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testCeilSqrt(n, k);
            }
        }

        for (const xn of PR_TEST_ARRAY.slice(-2)) {
            for (const yn of PR_TEST_ARRAY.slice(-2)) {
                for (const xd of PR_TEST_ARRAY.slice(-2)) {
                    for (const yd of PR_TEST_ARRAY.slice(-2)) {
                        testProductRatio({ n: xn, d: xd }, { n: yn, d: yd }, new Decimal(0), PR_MAX_ERROR);
                    }
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = 1; b <= 5; b++) {
                    testReducedRatio({ n: new Decimal(a), d: new Decimal(b) }, scale, new Decimal(0), new Decimal(0));
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = 1; b <= 5; b++) {
                    testNormalizedRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.00000241')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 5; a++) {
                for (let b = Math.max(a, 1); b <= 5; b++) {
                    testAccurateRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.0000024')
                    );
                }
            }
        }

        for (let n = 0; n < 5; n++) {
            for (let d = 1; d <= 5; d++) {
                testRoundDiv(new Decimal(n), new Decimal(d));
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
                                    testMulDiv(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }

        for (const n1 of [BigNumber.from(0), BigNumber.from(1000), BigNumber.from(10_000)]) {
            for (const n2 of [BigNumber.from(0), BigNumber.from(1000), BigNumber.from(10_000)]) {
                it(`subMax0(${n1.toString()}, ${n2.toString()})`, async () => {
                    expect(await mathContract.subMax0(n1, n2)).to.equal(BigNumber.max(n1.sub(n2), BigNumber.from(0)));
                });
            }
        }
    });

    describe('@stress tests', () => {
        for (let n = 1; n <= 256; n++) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testFloorSqrt(n, k);
            }
        }

        for (let n = 1; n <= 256; n++) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testCeilSqrt(n, k);
            }
        }

        for (const xn of PR_TEST_ARRAY) {
            for (const yn of PR_TEST_ARRAY) {
                for (const xd of PR_TEST_ARRAY) {
                    for (const yd of PR_TEST_ARRAY) {
                        testProductRatio({ n: xn, d: xd }, { n: yn, d: yd }, new Decimal(0), PR_MAX_ERROR);
                    }
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = 1; b <= 10; b++) {
                    testReducedRatio({ n: new Decimal(a), d: new Decimal(b) }, scale, new Decimal(0), new Decimal(0));
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(1); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    testReducedRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.135')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = 1; b <= 10; b++) {
                    testNormalizedRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.00000241')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(1); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    testNormalizedRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.135')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let a = 0; a < 10; a++) {
                for (let b = Math.max(a, 1); b <= 10; b++) {
                    testAccurateRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.0000024')
                    );
                }
            }
        }

        for (const scale of SCALES) {
            for (let i = new Decimal(1); i.lte(scale); i = i.mul(10)) {
                const a = MAX_UINT256.divToInt(scale).mul(i).add(1);
                for (let j = new Decimal(i); j.lte(scale); j = j.mul(10)) {
                    const b = MAX_UINT256.divToInt(scale).mul(j).add(1);
                    testAccurateRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal(0),
                        new Decimal('0.135')
                    );
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
                    testAccurateRatio(
                        { n: new Decimal(a), d: new Decimal(b) },
                        scale,
                        new Decimal('1.6'),
                        new Decimal(0)
                    );
                }
            }
        }

        for (let n = 0; n < 10; n++) {
            for (let d = 1; d <= 10; d++) {
                testRoundDiv(new Decimal(n), new Decimal(d));
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
                                    testMulDiv(methodName as MulDivFunction, x, y, z);
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
                                    testMulDiv(methodName as MulDivFunction, x, y, z);
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
                                    testMulDiv(methodName as MulDivFunction, x, y, z);
                                }
                            }
                        }
                    }
                }
            }
        }
    });
});
