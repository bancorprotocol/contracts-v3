import { expect } from 'chai';
import Contracts from '../../../components/Contracts';
import { TestHmaxFormula } from '../../../typechain';
import fs from 'fs';
import path from 'path';
import { BigNumber } from 'ethers';

describe('HmaxFormula', () => {
    let formula: TestHmaxFormula;

    before(async () => {
        formula = await Contracts.TestHmaxFormula.deploy();
    });

    describe('tests', () => {
        interface Row {
            b: string;
            c: string;
            e: string;
            m: string;
            n: string;
            x: string;
            expected: boolean;
        }

        const tests = (numOfTestsPerFile: number = Number.MAX_SAFE_INTEGER) => {
            const test = (fileName: string) => {
                const table: Row[] = JSON.parse(
                    fs.readFileSync(path.join(__dirname, '../../data', `${fileName}.json`), { encoding: 'utf8' })
                ).slice(0, numOfTestsPerFile);

                for (const {b, c, e, m, n, x, expected} of table) {
                    if (BigNumber.from(b).add(BigNumber.from(c)).gte(BigNumber.from(e))) {
                        it(`${fileName} surplus(${[b, c, e, m, n, x]})`, async () => {
                            const actual = await formula.surplus(b, c, e, m, n, x);
                            expect(actual).to.equal(expected);
                        });
                    }
                    else {
                        it(`${fileName} deficit(${[b, c, e, m, n, x]})`, async () => {
                            const actual = await formula.deficit(b, c, e, m, n, x);
                            expect(actual).to.equal(expected);
                        });
                    }
                }
            };

            test('HmaxFormulaCoverage1');
            test('HmaxFormulaCoverage2');
            test('HmaxFormulaCoverage3');
            test('HmaxFormulaCoverage4');
            test('HmaxFormulaCoverage5');
            test('HmaxFormulaCoverage6');
            test('HmaxFormulaCoverage7');
        };

        describe('quick tests', () => {
            tests(100);
        });

        describe('@stress tests', () => {
            tests();
        });
    });
});
