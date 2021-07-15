import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { TestFormula } from 'typechain';
import MathUtils from 'test/helpers/MathUtils';

const { Decimal, hMax } = MathUtils;

const AMOUNTS = [18, 21, 24, 27].map(x => new Decimal(10).pow(x));
const FEES = [2500, 5000, 10000].map(x => new Decimal(x));

describe.only('Formula', () => {
    let formulaContract: TestFormula;

    before(async () => {
        formulaContract = await Contracts.TestFormula.deploy();
    });

    for (const b of AMOUNTS) {
        for (const c of AMOUNTS) {
            for (const d of AMOUNTS) {
                for (const e of AMOUNTS) {
                    for (const n of FEES) {
                        const expected = hMax(b, c, d, e, n);
                        const [sb, sc, sd, se, sn] = [b, c, d, e, n].map(x => x.toFixed());
                        it(`hMax(${[sb, sc, sd, se, sn]})`, async () => {
                            const actual = new Decimal((await formulaContract.hMax(sb, sc, sd, se, sn)).toString());
                            if (!actual.eq(expected)) {
                                const absoluteError = actual.sub(expected).abs();
                                const relativeError = actual.div(expected).sub(1).abs();
                                expect(absoluteError.lte('1') || relativeError.lte('0.000000000000000001')).to.equal(
                                    true,
                                    `\nabsoluteError = ${absoluteError.toFixed()}\nrelativeError = ${relativeError.toFixed(25)}`
                                );
                            }
                        });
                    }
                }
            }
        }
    }
});
