import Contracts, { TestPoolCollectionWithdrawal } from '../../components/Contracts';
import { AlmostEqualOptions, Relation } from '../matchers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import fs from 'fs';
import path from 'path';

describe('PoolCollectionWithdrawal', () => {
    let poolCollectionWithdrawal: TestPoolCollectionWithdrawal;

    before(async () => {
        poolCollectionWithdrawal = await Contracts.TestPoolCollectionWithdrawal.deploy();
    });

    interface Row {
        a: string;
        b: string;
        c: string;
        e: string;
        w: string;
        m: string;
        n: string;
        x: string;
        p: string;
        q: string;
        r: string;
        s: string;
        t: string;
        u: string;
        v: string;
    }

    interface MaxErrors {
        p: AlmostEqualOptions;
        q: AlmostEqualOptions;
        r: AlmostEqualOptions;
        s: AlmostEqualOptions;
        t: AlmostEqualOptions;
        u: AlmostEqualOptions;
        v: AlmostEqualOptions;
    }

    const tests = (maxNumOfTestsPerFile: number = Number.MAX_SAFE_INTEGER) => {
        const test = (fileName: string, maxErrors: MaxErrors) => {
            const table: Row[] = JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', 'data', `${fileName}.json`), { encoding: 'utf8' })
            ).slice(0, maxNumOfTestsPerFile);

            for (const { a, b, c, e, w, m, n, x, p, q, r, s, t, u, v } of table) {
                it(`${fileName}(${[a, b, c, e, w, m, n, x]})`, async () => {
                    const actual = await poolCollectionWithdrawal.calculateWithdrawalAmountsT(a, b, c, e, w, m, n, x);
                    const actualZp = actual.p.value.mul(actual.p.isNeg ? -1 : 1);
                    const actualZq = actual.q.value.mul(actual.q.isNeg ? -1 : 1);
                    const actualZr = actual.r.value.mul(actual.r.isNeg ? -1 : 1);
                    expect(actualZp).to.almostEqual(new Decimal(p), maxErrors.p);
                    expect(actualZq).to.almostEqual(new Decimal(q), maxErrors.q);
                    expect(actualZr).to.almostEqual(new Decimal(r), maxErrors.r);
                    expect(actual.s).to.almostEqual(new Decimal(s), maxErrors.s);
                    expect(actual.t).to.almostEqual(new Decimal(t), maxErrors.t);
                    expect(actual.u).to.almostEqual(new Decimal(u), maxErrors.u);
                    expect(actual.v).to.almostEqual(new Decimal(v), maxErrors.v);
                });
            }
        };

        test('PoolCollectionWithdrawalCoverage1', {
            p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000002') },
            q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000002') },
            r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
            s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.LesserOrEqual }, // prettier-ignore
            t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000003') },
            u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000003') },
            v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.GreaterOrEqual } // prettier-ignore
        });

        test('PoolCollectionWithdrawalCoverage2', {
            p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000002') },
            q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000002') },
            r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
            s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.LesserOrEqual }, // prettier-ignore
            t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000000003') },
            u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000000003') },
            v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.GreaterOrEqual } // prettier-ignore
        });

        test('PoolCollectionWithdrawalCoverage3', {
            p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000000000000006') },
            q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000000000000006') },
            r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
            s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.LesserOrEqual }, // prettier-ignore
            t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000000000000000004') },
            u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000000000000000004') },
            v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.GreaterOrEqual } // prettier-ignore
        });

        test('PoolCollectionWithdrawalCoverage4', {
            p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000002') },
            q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000002') },
            r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
            s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.LesserOrEqual }, // prettier-ignore
            t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.003') },
            u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.003') },
            v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.GreaterOrEqual } // prettier-ignore
        });

        test('PoolCollectionWithdrawalCoverage5', {
            p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000000002') },
            q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000000002') },
            r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
            s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.LesserOrEqual }, // prettier-ignore
            t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000007') },
            u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000007') },
            v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.GreaterOrEqual } // prettier-ignore
        });

        test('PoolCollectionWithdrawalCoverage6', {
            p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000002') },
            q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000002') },
            r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
            s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.LesserOrEqual }, // prettier-ignore
            t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000003') },
            u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000003') },
            v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.GreaterOrEqual } // prettier-ignore
        });

        test('PoolCollectionWithdrawalCoverage7', {
            p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000006') },
            q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000006') },
            r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000000000000000000000000005') },
            s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000003'), relation: Relation.LesserOrEqual }, // prettier-ignore
            t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000002') },
            u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000002') },
            v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.GreaterOrEqual } // prettier-ignore
        });

        test('PoolCollectionWithdrawalCoverage8', {
            p: { maxAbsoluteError: new Decimal(0), maxRelativeError: new Decimal('0') },
            q: { maxAbsoluteError: new Decimal(0), maxRelativeError: new Decimal('0') },
            r: { maxAbsoluteError: new Decimal(0), maxRelativeError: new Decimal('0') },
            s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.LesserOrEqual }, // prettier-ignore
            t: { maxAbsoluteError: new Decimal(0), maxRelativeError: new Decimal('0') },
            u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000002') },
            v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0'), relation: Relation.GreaterOrEqual } // prettier-ignore
        });
    };

    describe('quick tests', () => {
        tests(100);
    });

    describe('@stress tests', () => {
        tests();
    });
});
