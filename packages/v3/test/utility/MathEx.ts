import Contracts from '../../components/Contracts';
import { TestMathEx } from '../../typechain-types';
import { floorSqrt, mulDivC, mulDivF } from '../helpers/MathUtils';
import { toUint512, fromUint512 } from '../helpers/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const MAX_UINT128 = new Decimal(2).pow(128).sub(1);
const MAX_UINT256 = new Decimal(2).pow(256).sub(1);
const PR_TEST_ARRAY = [MAX_UINT128, MAX_UINT256.divToInt(2), MAX_UINT256.sub(MAX_UINT128), MAX_UINT256];

const BN_TEST_ARRAY = [
    BigNumber.from(0),
    BigNumber.from(100),
    BigNumber.from(10_000),
    ...PR_TEST_ARRAY.map((x) => BigNumber.from(x.toFixed()))
];

describe('MathEx', () => {
    let mathContract: TestMathEx;

    before(async () => {
        mathContract = await Contracts.TestMathEx.deploy();
    });

    const testFloorSqrt = (n: number, k: number) => {
        const x = BigNumber.from(2).pow(n).add(k);
        it(`floorSqrt(${x.toHexString()})`, async () => {
            const expected = floorSqrt(x);
            const actual = await mathContract.floorSqrt(x);
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
                await expect(mathContract[methodName](a, b, c)).to.be.revertedWith('Overflow');
            }
        });
    };

    const testSubMax0 = (x: BigNumber, y: BigNumber) => {
        it(`subMax0(${x}, ${y})`, async () => {
            const expected = BigNumber.max(x.sub(y), 0);
            const actual = await mathContract.subMax0(x, y);
            expect(actual).to.equal(expected);
        });
    };

    const testMul512 = (x: BigNumber, y: BigNumber) => {
        it(`mul512(${x}, ${y})`, async () => {
            const expected = x.mul(y);
            const actual = await mathContract.mul512(x, y);
            expect(fromUint512(actual.hi, actual.lo)).to.equal(expected);
        });
    };

    const testGT512 = (x: BigNumber, y: BigNumber) => {
        it(`gt512(${x}, ${y})`, async () => {
            const expected = x.gt(y);
            const actual = await mathContract.gt512(toUint512(x), toUint512(y));
            expect(actual).to.equal(expected);
        });
    };

    const testLT512 = (x: BigNumber, y: BigNumber) => {
        it(`lt512(${x}, ${y})`, async () => {
            const expected = x.lt(y);
            const actual = await mathContract.lt512(toUint512(x), toUint512(y));
            expect(actual).to.equal(expected);
        });
    };

    const testGTE512 = (x: BigNumber, y: BigNumber) => {
        it(`gte512(${x}, ${y})`, async () => {
            const expected = x.gte(y);
            const actual = await mathContract.gte512(toUint512(x), toUint512(y));
            expect(actual).to.equal(expected);
        });
    };

    const testLTE512 = (x: BigNumber, y: BigNumber) => {
        it(`lte512(${x}, ${y})`, async () => {
            const expected = x.lte(y);
            const actual = await mathContract.lte512(toUint512(x), toUint512(y));
            expect(actual).to.equal(expected);
        });
    };

    describe('quick tests', () => {
        for (const n of [1, 64, 128, 192, 256]) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testFloorSqrt(n, k);
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

        for (const x of BN_TEST_ARRAY) {
            for (const y of BN_TEST_ARRAY) {
                testSubMax0(x, y);
                testMul512(x, y);
                testGT512(x, y);
                testLT512(x, y);
                testGTE512(x, y);
                testLTE512(x, y);
            }
        }
    });

    describe('@stress tests', () => {
        for (let n = 1; n <= 256; n++) {
            for (const k of n < 256 ? [-1, 0, +1] : [-1]) {
                testFloorSqrt(n, k);
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
