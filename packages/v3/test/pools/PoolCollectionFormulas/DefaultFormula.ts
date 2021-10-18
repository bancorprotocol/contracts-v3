import { expect } from 'chai';
import Contracts from '../../../components/Contracts';
import { TestDefaultFormula } from '../../../typechain';
import { prepare } from '../../helpers/Fixture';
import fs from 'fs';
import path from 'path';
import { BigNumber } from 'ethers';
import Decimal from 'decimal.js';

describe('DefaultFormula', () => {
    let formula: TestDefaultFormula;

    prepare(async () => {
        formula = await Contracts.TestDefaultFormula.deploy();
    });

    describe('tests', () => {
        interface Row {
            a: string;
            b: string;
            c: string;
            e: string;
            n: string;
            x: string;
            p: string;
            q: string;
            r: string;
            s: string;
            t: string;
        }

        const tests = (numOfTests: number = Number.MAX_SAFE_INTEGER) => {
            const table: Row[] = JSON.parse(
                fs.readFileSync(path.join(__dirname, '../../data/DefaultFormulaCoverage.json'), { encoding: 'utf8' })
            ).slice(0, numOfTests);

            for (const {a, b, c, e, n, x, p, q, r, s, t} of table) {
                if (BigNumber.from(b).add(BigNumber.from(c)).gte(BigNumber.from(e))) {
                    it(`surplus(${[a, b, c, e, n, x]})`, async () => {
                        const actual = await formula.surplus(a, b, c, e, n, x);
                        expect(actual.p).to.almostEqual(new Decimal(p), { maxAbsoluteError: new Decimal(1) });
                        expect(actual.q).to.almostEqual(new Decimal(q), { maxAbsoluteError: new Decimal(1) });
                        expect(actual.r).to.almostEqual(new Decimal(r), { maxAbsoluteError: new Decimal(1) });
                        expect(actual.s).to.almostEqual(new Decimal(s), { maxAbsoluteError: new Decimal(1) });
                        expect(actual.t).to.almostEqual(new Decimal(t), { maxAbsoluteError: new Decimal(1) });
                    });
                }
                else {
                    it(`deficit(${[a, b, c, e, n, x]})`, async () => {
                        const actual = await formula.deficit(a, b, c, e, n, x);
                        expect(actual.p).to.almostEqual(new Decimal(p), { maxAbsoluteError: new Decimal(1) });
                        expect(actual.q).to.almostEqual(new Decimal(q), { maxAbsoluteError: new Decimal(1) });
                        expect(actual.r).to.almostEqual(new Decimal(r), { maxAbsoluteError: new Decimal(1) });
                        expect(actual.s).to.almostEqual(new Decimal(s), { maxAbsoluteError: new Decimal(1) });
                        expect(actual.t).to.almostEqual(new Decimal(t), { maxAbsoluteError: new Decimal(1) });
                    });
                }
            }
        };

        describe('quick tests', () => {
            tests(100);
        });

        describe('@stress tests', () => {
            tests();
        });
    });
});
