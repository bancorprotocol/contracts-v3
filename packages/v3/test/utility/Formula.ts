import { expect } from 'chai';
import Contracts from 'components/Contracts';
import { TestFormula } from 'typechain';
import MathUtils from 'test/helpers/MathUtils';
import { PPM_RESOLUTION } from 'test/helpers/Constants';

const { Decimal } = MathUtils;
const PPMR = PPM_RESOLUTION.toNumber();

const AMOUNTS = [
    ...[12, 15, 18, 21, 24, 29].map(x => new Decimal(9).pow(x)),
    ...[12, 15, 18, 21, 24, 29].map(x => new Decimal(10).pow(x)),
];

const FEES = ['0', '0.05', '0.25', '0.5', '1'].map(x => new Decimal(x).mul(PPMR / 100));

describe('Formula', () => {
    let formulaContract: TestFormula;

    before(async () => {
        formulaContract = await Contracts.TestFormula.deploy();
    });

    // bden(b + c) / {b^3 + b^2(3c - 2e) + b[e^2(n + 1) + c(3c - 4e)] + c(c - e)^2}
    const hMaxExpected = (b: any, c: any, d: any, e: any, n: any) => {
        n = n.div(PPMR);
        return b.mul(d).mul(e).mul(n).mul(b.add(c)).div(
            b.pow(3)
            .add(b.pow(2).mul(c.mul(3).sub(e.mul(2))))
            .add(b.mul(e.pow(2).mul(n.add(1)).add(c.mul(c.mul(3).sub(e.mul(4))))))
            .add(c.mul(c.sub(e).pow(2)))
        );
    };

    const hMaxActual = async (b: any, c: any, d: any, e: any, n: any) => {
        const actual = await formulaContract.hMaxParts(b.toFixed(), c.toFixed(), d.toFixed(), e.toFixed(), n.toFixed());
        return new Decimal(actual.p.toString()).mul(actual.q.toString()).div(actual.r.toString()).div(actual.s.toString());
    };

    for (const b of AMOUNTS) {
        for (const c of AMOUNTS) {
            for (const d of AMOUNTS) {
                for (const e of AMOUNTS) {
                    for (const n of FEES) {
                        it(`hMax(${[b, c, d, e, n].map(x => x.toFixed())})`, async () => {
                            const expected = hMaxExpected(b, c, d, e, n);
                            const actual = await hMaxActual(b, c, d, e, n);
                            if (!actual.eq(expected)) {
                                const absoluteError = actual.sub(expected).abs();
                                const relativeError = actual.div(expected).sub(1).abs();
                                expect(absoluteError.lte('1') || relativeError.lte('0.00000000000000000000001')).to.equal(
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
