import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { isArray } from 'lodash';

declare global {
    export namespace Chai {
        interface Assertion {
            almostEqual(expected: any, maxAbsoluteError: Decimal, maxRelativeError: Decimal): void;
        }
    }
}

const supportFraction = (Assertion: Chai.AssertionStatic, utils: Chai.ChaiUtils) => {
    Assertion.overwriteMethod('equals', override('equal', utils));
    Assertion.overwriteMethod('equal', override('equal', utils));
    Assertion.overwriteMethod('eq', override('equal', utils));
    Assertion.addMethod('almostEqual', almostEqual(utils));
};

const isFraction = (fraction: any) => fraction.hasOwnProperty('n') && fraction.hasOwnProperty('d');
const toString = (fraction: any) => `{n: ${fraction.n.toString()}, d: ${fraction.d.toString()}}`;
const toDecimal = (value: any) => new Decimal(BigNumber.isBigNumber(value) ? value.toString() : value);
const toDecimalFraction = (fraction: any) => {
    if (isFraction(fraction)) {
        return {
            n: toDecimal(fraction.n),
            d: toDecimal(fraction.n)
        };
    }

    if (isArray(fraction) && fraction.length == 2) {
        return {
            n: toDecimal(fraction[0]),
            d: toDecimal(fraction[1])
        };
    }

    throw new Error(`${fraction} is not a Fraction`);
};

const override = (name: string, utils: Chai.ChaiUtils) => {
    return (_super: (...args: any[]) => any) => overwriteFractionFunction(name, _super, utils);
};

function overwriteFractionFunction(readableName: string, _super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [expected] = args;
        const obj = chaiUtils.flag(this, 'object');

        if (isFraction(obj) && isFraction(expected)) {
            const objBN = toDecimalFraction(obj);
            const expectedBN = toDecimalFraction(expected);

            // if neither of the denominators are zero - compare the result of the division. Otherwise, co an explicit
            // comparison
            let res;
            if (!objBN.d.isZero() && !expectedBN.d.isZero()) {
                res = objBN.n.div(objBN.d).eq(expectedBN.n.div(expectedBN.d));
            } else {
                res = objBN.n.eq(expectedBN.n) && objBN.d.eq(expectedBN.d);
            }

            this.assert(
                res,
                `Expected ${toString(objBN)} to be ${readableName} to ${toString(expectedBN)}`,
                `Expected ${toString(objBN)} NOT to be ${readableName} to ${toString(expectedBN)}`,
                objBN,
                expectedBN
            );
        } else {
            _super.apply(this, args);
        }
    };
}

function almostEqual(chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [expected, maxAbsoluteError, maxRelativeError] = args;
        const obj = chaiUtils.flag(this, 'object');

        expect(maxAbsoluteError).to.be.instanceOf(Decimal);
        expect(maxRelativeError).to.be.instanceOf(Decimal);

        const objFraction = toDecimalFraction(obj);
        const expectedFraction = toDecimalFraction(expected);

        const x = objFraction.n.mul(expectedFraction.d.toString());
        const y = objFraction.d.mul(expectedFraction.n.toString());

        if (x.eq(y)) {
            return;
        }

        const absoluteError = x.sub(y).abs();
        const relativeError = x.div(y).sub(1).abs();
        this.assert(
            absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError),
            `Expected ${toString(objFraction)} to be almost equal to ${toString(
                expectedFraction
            )} (absoluteError = ${absoluteError.toFixed()}, relativeError = ${relativeError.toFixed(25)}`,
            `Expected ${toString(objFraction)} NOT to be almost equal to to ${toString(
                expectedFraction
            )} (absoluteError = ${absoluteError.toFixed()}, relativeError = ${relativeError.toFixed(25)}`,
            objFraction,
            expectedFraction
        );
    };
}

export default supportFraction;
