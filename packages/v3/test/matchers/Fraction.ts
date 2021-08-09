import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { isArray } from 'lodash';

declare global {
    export namespace Chai {
        interface Assertion {
            almostEqual(actual: any, maxAbsoluteError: Decimal, maxRelativeError: Decimal): void;
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
        const [actual] = args;
        const expected = chaiUtils.flag(this, 'object');

        if (isFraction(expected) && isFraction(actual)) {
            const expectedBN = toDecimalFraction(expected);
            const actualBN = toDecimalFraction(actual);

            // if neither of the denominators are zero - compare the result of the division. Otherwise, co an explicit
            // comparison
            let res;
            if (!expectedBN.d.isZero() && !actualBN.d.isZero()) {
                res = expectedBN.n.div(expectedBN.d).eq(actualBN.n.div(actualBN.d));
            } else {
                res = expectedBN.n.eq(actualBN.n) && expectedBN.d.eq(actualBN.d);
            }

            this.assert(
                res,
                `Expected ${toString(expectedBN)} to be ${readableName} to ${toString(actualBN)}`,
                `Expected ${toString(expectedBN)} NOT to be ${readableName} to ${toString(actualBN)}`,
                expectedBN,
                actualBN
            );
        } else {
            _super.apply(this, args);
        }
    };
}

function almostEqual(chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [actual, maxAbsoluteError, maxRelativeError] = args;
        const expected = chaiUtils.flag(this, 'object');

        expect(maxAbsoluteError).to.be.instanceOf(Decimal);
        expect(maxRelativeError).to.be.instanceOf(Decimal);

        const expectedFraction = toDecimalFraction(expected);
        const actualFraction = toDecimalFraction(actual);

        const x = expectedFraction.n.mul(actualFraction.d.toString());
        const y = expectedFraction.d.mul(actualFraction.n.toString());

        if (x.eq(y)) {
            return;
        }

        const absoluteError = x.sub(y).abs();
        const relativeError = x.div(y).sub(1).abs();
        this.assert(
            absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError),
            `Expected ${toString(expectedFraction)} to be almost equal to ${toString(
                actualFraction
            )} (absoluteError = ${absoluteError.toFixed()}, relativeError = ${relativeError.toFixed(25)}`,
            `Expected ${toString(expectedFraction)} NOT to be almost equal to to ${toString(
                actualFraction
            )} (absoluteError = ${absoluteError.toFixed()}, relativeError = ${relativeError.toFixed(25)}`,
            expectedFraction,
            actualFraction
        );
    };
}

export default supportFraction;
