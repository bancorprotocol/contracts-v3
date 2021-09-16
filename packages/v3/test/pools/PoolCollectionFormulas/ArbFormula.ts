import { expect } from 'chai';
import Contracts from '../../../components/Contracts';
import { TestArbFormula } from '../../../typechain';
import fs from 'fs';
import path from 'path';
import Decimal from 'decimal.js';

describe('ArbFormula', () => {
    let formula: TestArbFormula;

    before(async () => {
        formula = await Contracts.TestArbFormula.deploy();
    });

    describe('tests', () => {
        interface Row {
            a: string;
            b: string;
            f: string;
            m: string;
            surplus: string;
            deficit: string;
        }

        const tests = (numOfTestsPerFile: number = Number.MAX_SAFE_INTEGER) => {
            const test = (fileName: string) => {
                const table: Row[] = JSON.parse(
                    fs.readFileSync(path.join(__dirname, '../../data', `${fileName}.json`), { encoding: 'utf8' })
                ).slice(0, numOfTestsPerFile);

                for (const {a, b, f, m, surplus, deficit} of table) {
                    if (surplus.length > 0) {
                        it(`${fileName} surplus(${[a, b, f, m]})`, async () => {
                            const actual = await formula.surplus(a, b, f, m);
                            expect(actual).to.almostEqual(new Decimal(surplus), new Decimal(1), new Decimal(0));
                        });
                    }
                    if (deficit.length > 0) {
                        it(`${fileName} deficit(${[a, b, f, m]})`, async () => {
                            const actual = await formula.deficit(a, b, f, m);
                            expect(actual).to.almostEqual(new Decimal(deficit), new Decimal(1), new Decimal(0));
                        });
                    }
                }
            };

            test('ArbFormulaCoverage1');
            test('ArbFormulaCoverage2');
            test('ArbFormulaCoverage3');
            test('ArbFormulaCoverage4');
            test('ArbFormulaCoverage5');
            test('ArbFormulaCoverage6');
            test('ArbFormulaCoverage7');
        };

        describe('quick tests', () => {
            tests(100);
        });

        describe('@stress tests', () => {
            tests();
        });
    });
});
