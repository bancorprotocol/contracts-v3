import { expect } from 'chai';
import Contracts from '../../../components/Contracts';
import { TestDefFormula } from '../../../typechain';
import fs from 'fs';
import path from 'path';
import { BigNumber } from 'ethers';
import Decimal from 'decimal.js';

describe('DefFormula', () => {
    let formula: TestDefFormula;

    before(async () => {
        formula = await Contracts.TestDefFormula.deploy();
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
                fs.readFileSync(path.join(__dirname, '../../data/DefFormulaCoverage.json'), { encoding: 'utf8' })
            ).slice(0, numOfTests);

            for (const {a, b, c, e, n, x, p, q, r, s, t} of table) {
                if (BigNumber.from(b).add(BigNumber.from(c)).gte(BigNumber.from(e))) {
                    it(`surplus(${[a, b, c, e, n, x]})`, async () => {
                        const actual = await formula.surplus(a, b, c, e, n, x);
                        expect(actual.p).to.almostEqual(new Decimal(p), new Decimal(1), new Decimal(0));
                        expect(actual.q).to.almostEqual(new Decimal(q), new Decimal(1), new Decimal(0));
                        expect(actual.r).to.almostEqual(new Decimal(r), new Decimal(1), new Decimal(0));
                        expect(actual.s).to.almostEqual(new Decimal(s), new Decimal(1), new Decimal(0));
                        expect(actual.t).to.almostEqual(new Decimal(t), new Decimal(1), new Decimal(0));
                    });
                }
                else {
                    it(`deficit(${[a, b, c, e, n, x]})`, async () => {
                        const actual = await formula.deficit(a, b, c, e, n, x);
                        expect(actual.p).to.almostEqual(new Decimal(p), new Decimal(1), new Decimal(0));
                        expect(actual.q).to.almostEqual(new Decimal(q), new Decimal(1), new Decimal(0));
                        expect(actual.r).to.almostEqual(new Decimal(r), new Decimal(1), new Decimal(0));
                        expect(actual.s).to.almostEqual(new Decimal(s), new Decimal(1), new Decimal(0));
                        expect(actual.t).to.almostEqual(new Decimal(t), new Decimal(1), new Decimal(0));
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
