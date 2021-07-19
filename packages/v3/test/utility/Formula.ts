import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { TestFormula } from 'typechain';
import MathUtils from 'test/helpers/MathUtils';
import { MAX_UINT256, PPM_RESOLUTION } from 'test/helpers/Constants';

const { Decimal } = MathUtils;
const MAX_VAL = MAX_UINT256.toString();
const PPMR = PPM_RESOLUTION.toNumber();

const AMOUNTS = [
    ...[12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(9).pow(x).toFixed()),
    ...[12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(10).pow(x).toFixed())
];

const FEES = [0, 0.05, 0.25, 0.5, 1].map((x) => (x * PPMR) / 100);

const MIN_RATIO = '0.99999999999999999999999';

describe('Formula', () => {
    let formula: TestFormula;

    before(async () => {
        formula = await Contracts.TestFormula.deploy();
    });

    // c(c - e)^2 / b <= 2^256 - 1
    const hMaxComputable = (b: any, c: any, e: any) => {
        [b, c, e] = [b, c, e].map((x) => new Decimal(x));
        return c.mul(c.sub(e).pow(2)).div(b).lte(MAX_VAL);
    };

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
        const actual = await formula.hMaxParts(b, c, d, e, n);
        return new Decimal(actual.p.toString())
            .mul(actual.q.toString())
            .div(actual.r.toString())
            .div(actual.s.toString());
    };

    // ac[b(2 - m) + c] / [b(b + mc)]
    const arbAmount = (a: any, b: any, c: any, m: any) => {
        [a, b, c, m] = [a, b, c, m].map((x) => new Decimal(x));
        m = m.div(PPMR);
        return a
            .mul(c)
            .mul(b.mul(new Decimal(2).sub(m)).add(c))
            .div(b.mul(b.add(m.mul(c))))
            .floor();
    };

    for (const b of AMOUNTS) {
        for (const c of AMOUNTS) {
            for (const e of AMOUNTS) {
                it(`hMaxComputable(${[b, c, e]})`, async () => {
                    const expected = hMaxComputable(b, c, e);
                    const actual = await formula.hMaxComputable(b, c, e);
                    expect(actual).to.be.equal(expected);
                });
            }
        }
    }

    for (const b of AMOUNTS) {
        for (const c of AMOUNTS) {
            for (const d of AMOUNTS) {
                for (const e of AMOUNTS) {
                    for (const n of FEES) {
                        if (hMaxComputable(b, c, e)) {
                            it(`hMax(${[b, c, d, e, n]})`, async () => {
                                const expected = hMaxExpected(b, c, d, e, n);
                                const actual = await hMaxActual(b, c, d, e, n);
                                if (!actual.eq(expected)) {
                                    const ratio = actual.div(expected);
                                    expect(ratio.gte(MIN_RATIO) && ratio.lte(1)).to.equal(
                                        true,
                                        `ratio = ${ratio.toFixed(25)}`
                                    );
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
                            it(`hMaxCondition(${[b, c, d, e, n, x]})`, async () => {
                                const expected = hMaxExpected(b, c, d, e, n).gte(x);
                                const actual = await formula.hMaxCondition(b, c, d, e, n, x);
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
                            it(`hMaxCondition(${[b, c, d, e, n, x]})`, async () => {
                                const expected = hMaxExpected(b, c, d, e, n).gte(x);
                                const actual = await formula.hMaxCondition(b, c, d, e, n, x);
                                expect(actual).to.be.equal(expected);
                            });
                        }
                    }
                }
            }
        }
    }

    for (const a of AMOUNTS) {
        for (const b of AMOUNTS) {
            for (const c of AMOUNTS) {
                for (const m of FEES) {
                    it(`arbAmount(${[a, b, c, m]})`, async () => {
                        const expected = arbAmount(a, b, c, m);
                        if (expected.lte(MAX_VAL)) {
                            const actual = await formula.arbAmount(a, b, c, m);
                            expect(actual).to.be.equal(expected.toFixed());
                        } else {
                            await expect(formula.arbAmount(a, b, c, m)).to.be.revertedWith('ERR_OVERFLOW');
                        }
                    });
                }
            }
        }
    }
});
