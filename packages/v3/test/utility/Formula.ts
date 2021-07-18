import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { TestFormula } from 'typechain';
import MathUtils from 'test/helpers/MathUtils';
import { PPM_RESOLUTION } from 'test/helpers/Constants';

const { Decimal } = MathUtils;
const PPMR = PPM_RESOLUTION.toNumber();

const AMOUNTS = [
    ...[12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(9).pow(x)),
    ...[12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(10).pow(x))
];

const FEES = ['0', '0.05', '0.25', '0.5', '1'].map((x) => new Decimal(x).mul(PPMR / 100));

const MAX_AMOUNT_C_DIV_AMOUNT_B = new Decimal(10).pow(9);

const MAX_ERROR = '0.00000000000000000000001';

describe('Formula', () => {
    let formulaContract: TestFormula;

    before(async () => {
        formulaContract = await Contracts.TestFormula.deploy();
    });

    // bden(b + c) / {b^3 + b^2(3c - 2e) + b[e^2(n + 1) + c(3c - 4e)] + c(c - e)^2}
    const hMaxExpected = (b: any, c: any, d: any, e: any, n: any) => {
        [b, c, d, e, n] = [b, c, d, e, n].map((x) => new Decimal(x));
        n = n.div(PPMR);
        return b
            .mul(d)
            .mul(e)
            .mul(n)
            .mul(b.add(c))
            .div(
                b
                    .pow(3)
                    .add(b.pow(2).mul(c.mul(3).sub(e.mul(2))))
                    .add(
                        b.mul(
                            e
                                .pow(2)
                                .mul(n.add(1))
                                .add(c.mul(c.mul(3).sub(e.mul(4))))
                        )
                    )
                    .add(c.mul(c.sub(e).pow(2)))
            );
    };

    const hMaxActual = async (b: any, c: any, d: any, e: any, n: any) => {
        const actual = await formulaContract.hMaxParts(b.toFixed(), c.toFixed(), d.toFixed(), e.toFixed(), n.toFixed());
        return new Decimal(actual.p.toString())
            .mul(actual.q.toString())
            .div(actual.r.toString())
            .div(actual.s.toString());
    };

    for (const b of AMOUNTS) {
        for (const c of AMOUNTS) {
            for (const d of AMOUNTS) {
                for (const e of AMOUNTS) {
                    for (const n of FEES) {
                        if (c.div(b).lte(MAX_AMOUNT_C_DIV_AMOUNT_B)) {
                            it(`hMax(${[b, c, d, e, n].map((x) => x.toFixed())})`, async () => {
                                const expected = hMaxExpected(b, c, d, e, n);
                                const actual = await hMaxActual(b, c, d, e, n);
                                if (!actual.eq(expected)) {
                                    const error = actual.div(expected).sub(1).abs();
                                    expect(error.lte(MAX_ERROR)).to.equal(true, `error = ${error.toFixed(25)}`);
                                }
                            });
                        }
                    }
                }
            }
        }
    }

    for (const b of [123456, 456789, 1000000, 88888888]) {
        for (const c of [123456, 456789, 1000000, 88888888]) {
            for (const d of [123456, 456789, 1000000, 88888888]) {
                for (const e of [123456, 456789, 1000000, 88888888]) {
                    for (const n of [2500, 25000]) {
                        for (const x of [10, 100, 1000, 10000].map((y) => Math.floor(d / y))) {
                            it(`hMaxLargerThanOrEqualTo(${[b, c, d, e, n, x]})`, async () => {
                                const expected = hMaxExpected(b, c, d, e, n).gte(x);
                                const actual = await formulaContract.hMaxLargerThanOrEqualTo(b, c, d, e, n, x);
                                expect(actual).to.be.equal(expected);
                            });
                        }
                    }
                }
            }
        }
    }

    for (const b of [3, 5, 7, 9].map((y) => `${y}`.repeat(34))) {
        for (const c of [3, 5, 7, 9].map((y) => `${y}`.repeat(34))) {
            for (const d of [3, 5, 7, 9].map((y) => `${y}`.repeat(34))) {
                for (const e of [3, 5, 7, 9].map((y) => `${y}`.repeat(34))) {
                    for (const n of [2500, 25000]) {
                        for (const x of [1, 2, 3, 4].map((y) => d.slice(0, -y))) {
                            it(`hMaxLargerThanOrEqualTo(${[b, c, d, e, n, x]})`, async () => {
                                const expected = hMaxExpected(b, c, d, e, n).gte(x);
                                const actual = await formulaContract.hMaxLargerThanOrEqualTo(b, c, d, e, n, x);
                                expect(actual).to.be.equal(expected);
                            });
                        }
                    }
                }
            }
        }
    }
});
