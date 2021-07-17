import { BigNumber } from 'ethers';

const supportFraction = (Assertion: Chai.AssertionStatic, utils: Chai.ChaiUtils) => {
    Assertion.overwriteMethod('equals', override('equal', utils));
    Assertion.overwriteMethod('equal', override('equal', utils));
    Assertion.overwriteMethod('eq', override('equal', utils));
};

const isFraction = (fraction: any) => fraction.hasOwnProperty('n') && fraction.hasOwnProperty('d');
const toString = (fraction: any) => `{n: ${fraction.n.toString()}, d: ${fraction.d.toString()}}`;

const override = (name: string, utils: Chai.ChaiUtils) => {
    return (_super: (...args: any[]) => any) => overwriteFractionFunction(name, _super, utils);
};

function overwriteFractionFunction(readableName: string, _super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [actual] = args;
        const expected = chaiUtils.flag(this, 'object');

        if (isFraction(expected) || isFraction(actual)) {
            const en = BigNumber.from(expected.n);
            const ed = BigNumber.from(expected.d);
            const an = BigNumber.from(actual.n);
            const ad = BigNumber.from(actual.d);

            // if neither of the denominators are zero - compare the result of the division. Otherwise, co an explicit
            // comparison
            let res;
            if (!ed.isZero() && !ad.isZero()) {
                res = en.div(ed).eq(an.div(ad));
            } else {
                res = en.eq(an) && ed.eq(ad);
            }

            this.assert(
                res,
                `Expected ${toString(expected)} to be ${readableName} to ${toString(actual)}`,
                `Expected ${toString(expected)} NOT to be ${readableName} to ${toString(actual)}`,
                expected,
                actual
            );
        } else {
            _super.apply(this, args);
        }
    };
}

export default supportFraction;
