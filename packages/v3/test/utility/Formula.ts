import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { TestFormula } from 'typechain';
import Formula from 'test/helpers/Formula';

const { Decimal } = Formula;

const AMOUNTS = [
    ...[12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(9).pow(x).toFixed()),
    ...[12, 15, 18, 21, 25, 29, 34].map((x) => new Decimal(10).pow(x).toFixed())
];

const FEES = [0, 0.05, 0.25, 0.5, 1].map((x) => (x * Formula.PPMR) / 100);

const MIN_RATIO = '0.99999999999999999999999';

describe('Formula', () => {
    let formula: TestFormula;

    before(async () => {
        formula = await Contracts.TestFormula.deploy();
    });

    for (const b of [123456, 456789, 1000000, 88888888]) {
        for (const c of [123456, 456789, 1000000, 88888888]) {
            for (const d of [123456, 456789, 1000000, 88888888]) {
                for (const e of [123456, 456789, 1000000, 88888888]) {
                    for (const n of [2500, 25000]) {
                        for (const x of [10, 100, 1000, 10000].map((y) => Math.floor(d / y))) {
                            it(`maxArbCondition(${[b, c, d, e, n, x]})`, async () => {
                                const expected = Formula.maxArbCondition(b, c, d, e, n, x);
                                const actual = await formula.maxArbCondition(b, c, d, e, n, x);
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
                            it(`maxArbCondition(${[b, c, d, e, n, x]})`, async () => {
                                const expected = Formula.maxArbCondition(b, c, d, e, n, x);
                                const actual = await formula.maxArbCondition(b, c, d, e, n, x);
                                expect(actual).to.be.equal(expected);
                            });
                        }
                    }
                }
            }
        }
    }

    for (const b of AMOUNTS) {
        for (const c of AMOUNTS) {
            for (const e of AMOUNTS) {
                it(`maxArbComputable(${[b, c, e]})`, async () => {
                    const expected = Formula.maxArbComputable(b, c, e);
                    const actual = await formula.maxArbComputable(b, c, e);
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
                        if (Formula.maxArbComputable(b, c, e)) {
                            it(`maxArb(${[b, c, d, e, n]})`, async () => {
                                const expected = Formula.maxArb(b, c, d, e, n);
                                const { p, q, r, s } = await formula.maxArbParts(b, c, d, e, n);
                                const actual = new Decimal(p.toString())
                                    .mul(q.toString())
                                    .div(r.toString())
                                    .div(s.toString());
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

    for (const a of AMOUNTS) {
        for (const b of AMOUNTS) {
            for (const f of AMOUNTS) {
                for (const m of FEES) {
                    it(`optArb(${[a, b, f, m]})`, async () => {
                        const expected = Formula.optArb(a, b, f, m);
                        if (expected.lte(Formula.MAX_VAL)) {
                            const actual = await formula.optArb(a, b, f, m);
                            expect(actual).to.be.equal(expected.toFixed());
                        } else {
                            await expect(formula.optArb(a, b, f, m)).to.be.revertedWith('ERR_OVERFLOW');
                        }
                    });
                }
            }
        }
    }
});
