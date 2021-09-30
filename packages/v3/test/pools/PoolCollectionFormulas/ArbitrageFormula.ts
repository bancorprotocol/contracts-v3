import { expect } from 'chai';
import Contracts from '../../../components/Contracts';
import { TestArbitrageFormula } from '../../../typechain';
import { AlmostEqualOptions } from '../../matchers';
import fs from 'fs';
import path from 'path';
import { BigNumber } from 'ethers';
import Decimal from 'decimal.js';

describe('ArbitrageFormula', () => {
    let formula: TestArbitrageFormula;

    before(async () => {
        formula = await Contracts.TestArbitrageFormula.deploy();
    });

    describe('tests', () => {
        interface Row {
            a: string;
            b: string;
            c: string;
            e: string;
            m: string;
            n: string;
            x: string;
            p: string;
            q: string;
            r: string;
            s: string;
        }

        interface MaxErrors {
            p: AlmostEqualOptions;
            q: AlmostEqualOptions;
            r: AlmostEqualOptions;
            s: AlmostEqualOptions;
        }

        const tests = (numOfTestsPerFile: number = Number.MAX_SAFE_INTEGER) => {
            const test = (fileName: string, maxErrors: MaxErrors) => {
                const table: Row[] = JSON.parse(
                    fs.readFileSync(path.join(__dirname, '../../data', `${fileName}.json`), { encoding: 'utf8' })
                ).slice(0, numOfTestsPerFile);

                for (const {a, b, c, e, m, n, x, p, q, r, s} of table) {
                    if (BigNumber.from(b).add(BigNumber.from(c)).gte(BigNumber.from(e))) {
                        it(`${fileName} surplus(${[a, b, c, e, m, n, x]})`, async () => {
                            const actual = await formula.surplus(a, b, c, e, m, n, x);
                            expect(actual.p).to.almostEqual(new Decimal(p), maxErrors.p);
                            expect(actual.q).to.almostEqual(new Decimal(q), maxErrors.q);
                            expect(actual.r).to.almostEqual(new Decimal(r), maxErrors.r);
                            expect(actual.s).to.almostEqual(new Decimal(s), maxErrors.s);
                        });
                    }
                    else {
                        it(`${fileName} deficit(${[a, b, c, e, m, n, x]})`, async () => {
                            const actual = await formula.deficit(a, b, c, e, m, n, x);
                            expect(actual.p).to.almostEqual(new Decimal(p), maxErrors.p);
                            expect(actual.q).to.almostEqual(new Decimal(q), maxErrors.q);
                            expect(actual.r).to.almostEqual(new Decimal(r), maxErrors.r);
                            expect(actual.s).to.almostEqual(new Decimal(s), maxErrors.s);
                        });
                    }
                }
            };

            test(
                'ArbitrageFormulaCoverage1', {
                    p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000004') },
                    q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000004') },
                    r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                    s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                }
            );

            test(
                'ArbitrageFormulaCoverage2', {
                    p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000005') },
                    q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000000000009') },
                    r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                    s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                }
            );

            test(
                'ArbitrageFormulaCoverage3', {
                    p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000000000000003') },
                    q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.0000000000000000002') },
                    r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                    s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                }
            );

            test(
                'ArbitrageFormulaCoverage4', {
                    p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.003') },
                    q: { maxAbsoluteError: new Decimal(2), maxRelativeError: new Decimal('0.002') },
                    r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                    s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                }
            );

            test(
                'ArbitrageFormulaCoverage5', {
                    p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00002') },
                    q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000007') },
                    r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                    s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                }
            );

            test(
                'ArbitrageFormulaCoverage6', {
                    p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000005') },
                    q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.00000000005') },
                    r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                    s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                }
            );

            test(
                'ArbitrageFormulaCoverage7', {
                    p: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000002') },
                    q: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0.000003') },
                    r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                    s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                }
            );

            test(
                'ArbitrageFormulaCoverage8', {
                    p: { maxAbsoluteError: new Decimal(2), maxRelativeError: new Decimal('0.009') },
                    q: { maxAbsoluteError: new Decimal(2), maxRelativeError: new Decimal('0.009') },
                    r: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                    s: { maxAbsoluteError: new Decimal(1), maxRelativeError: new Decimal('0') },
                }
            );
        };

        describe('quick tests', () => {
            tests(100);
        });

        describe('@stress tests', () => {
            tests();
        });
    });
});
