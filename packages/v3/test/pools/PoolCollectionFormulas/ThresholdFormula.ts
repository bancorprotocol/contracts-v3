import { expect } from 'chai';
import Contracts from '../../../components/Contracts';
import { TestThresholdFormula } from '../../../typechain';
import fs from 'fs';
import path from 'path';
import { BigNumber } from 'ethers';

describe('ThresholdFormula', () => {
    let formula: TestThresholdFormula;

    before(async () => {
        formula = await Contracts.TestThresholdFormula.deploy();
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

        const tests = (numOfTests: number = Number.MAX_SAFE_INTEGER) => {
            const table: Row[] = JSON.parse(
                fs.readFileSync(path.join(__dirname, '../../data/ThresholdFormulaCoverage.json'), { encoding: 'utf8' })
            ).slice(0, numOfTests);

            for (const {b, c, e, m, n, x, expected} of table) {
                if (BigNumber.from(b).add(BigNumber.from(c)).gte(BigNumber.from(e))) {
                    it(`surplus(${[b, c, e, m, n, x]})`, async () => {
                        const actual = await formula.surplus(b, c, e, m, n, x);
                        expect(actual).to.equal(expected);
                    });
                }
                else {
                    it(`deficit(${[b, c, e, m, n, x]})`, async () => {
                        const actual = await formula.deficit(b, c, e, m, n, x);
                        expect(actual).to.equal(expected);
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
