import Contracts from '../../components/Contracts';
import { TestPoolCollectionWithdrawal } from '../../typechain';
import { AlmostEqualOptions } from '../matchers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import fs from 'fs';
import path from 'path';

describe('PoolCollectionWithdrawal', () => {
    let poolCollectionWithdrawal: TestPoolCollectionWithdrawal;

    before(async () => {
        poolCollectionWithdrawal = await Contracts.TestPoolCollectionWithdrawal.deploy();
    });

    describe('formula', () => {
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

        const tests = (numOfTestsPerFile: number = Number.MAX_SAFE_INTEGER) => {
            const test = (fileName: string, maxErrors: MaxErrors) => {
                const table: Row[] = JSON.parse(
                    fs.readFileSync(path.join(__dirname, '../data', `${fileName}.json`), { encoding: 'utf8' })
                ).slice(0, numOfTestsPerFile);

                for (const { a, b, c, e, w, m, n, x, p, q, r, s, t, u, v } of table) {
                    it(`${fileName}(${[a, b, c, e, w, m, n, x]})`, async () => {
                        const actual = await poolCollectionWithdrawal.formulaT(a, b, c, e, w, m, n, x);
                        const actual_p = actual.p.value.mul(actual.p.isNeg ? -1 : 1);
                        const actual_q = actual.q.value.mul(actual.q.isNeg ? -1 : 1);
                        const actual_r = actual.r.value.mul(actual.r.isNeg ? -1 : 1);
                        expect(actual_p).to.almostEqual(new Decimal(p), maxErrors.p);
                        expect(actual_q).to.almostEqual(new Decimal(q), maxErrors.q);
                        expect(actual_r).to.almostEqual(new Decimal(r), maxErrors.r);
                        expect(actual.s).to.almostEqual(new Decimal(s), maxErrors.s);
                        expect(actual.t).to.almostEqual(new Decimal(t), maxErrors.t);
                        expect(actual.u).to.almostEqual(new Decimal(u), maxErrors.u);
                        expect(actual.v).to.almostEqual(new Decimal(v), maxErrors.v);
                    });
                }
            };

            // prettier-ignore
            test('WithdrawalAmountsCoverage1', {
                p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000002') },
                q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000002') },
                r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000003') },
                u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000003') },
                v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') }
            });

            // prettier-ignore
            test('WithdrawalAmountsCoverage2', {
                p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000002') },
                q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000002') },
                r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000000003') },
                u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000000003') },
                v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') }
            });

            // prettier-ignore
            test('WithdrawalAmountsCoverage3', {
                p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000000000000006') },
                q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000000000000006') },
                r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000000000000000004') },
                u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000000000000000004') },
                v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') }
            });

            // prettier-ignore
            test('WithdrawalAmountsCoverage4', {
                p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000002') },
                q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000002') },
                r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.003') },
                u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.003') },
                v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') }
            });

            // prettier-ignore
            test('WithdrawalAmountsCoverage5', {
                p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000000002') },
                q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000000002') },
                r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000007') },
                u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000007') },
                v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') }
            });

            // prettier-ignore
            test('WithdrawalAmountsCoverage6', {
                p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000002') },
                q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000002') },
                r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000003') },
                u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000003') },
                v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') }
            });

            // prettier-ignore
            test('WithdrawalAmountsCoverage7', {
                p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000006') },
                q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000006') },
                r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000000000000000000000000005') },
                s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000003') },
                t: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000002') },
                u: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000000002') },
                v: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') }
            });
        };

        describe('quick tests', () => {
            tests(100);
        });

        describe('@stress tests', () => {
            tests();
        });
    });
});
