import { Fraction, isFraction, toDecimal, toString } from '../../utils/Types';
import { Relation } from '../matchers';
import { expect } from 'chai';
import Decimal from 'decimal.js';

const supportFraction = (Assertion: Chai.AssertionStatic, utils: Chai.ChaiUtils) => {
    Assertion.overwriteMethod('equals', override('equal', utils));
    Assertion.overwriteMethod('equal', override('equal', utils));
    Assertion.overwriteMethod('eq', override('equal', utils));
    Assertion.overwriteMethod('almostEqual', overrideAlmostEqual(utils));
};

const override = (name: string, utils: Chai.ChaiUtils) => {
    return (_super: (...args: any[]) => any) => overwriteFractionFunction(name, _super, utils);
};

const overwriteFractionFunction = (
    readableName: string,
    _super: (...args: any[]) => any,
    chaiUtils: Chai.ChaiUtils
) => {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [expected] = args;
        const actual = chaiUtils.flag(this, 'object');

        if (isFraction(actual) && isFraction(expected)) {
            const actualDec = toDecimal(actual) as Fraction<Decimal>;
            const expectedDec = toDecimal(expected) as Fraction<Decimal>;

            // if neither of the denominators are zero - compare the result of the division. Otherwise, co an explicit
            // comparison
            let res;
            if (!actualDec.d.isZero() && !expectedDec.d.isZero()) {
                res = actualDec.n.div(actualDec.d).eq(expectedDec.n.div(expectedDec.d));
            } else {
                res = actualDec.n.eq(expectedDec.n) && actualDec.d.eq(expectedDec.d);
            }

            this.assert(
                res,
                `Expected ${toString(actualDec)} to be ${readableName} to ${toString(expectedDec)}`,
                `Expected ${toString(actualDec)} NOT to be ${readableName} to ${toString(expectedDec)}`,
                toString(expectedDec),
                toString(actualDec)
            );
        } else {
            _super.apply(this, args);
        }
    };
};

const overrideAlmostEqual = (utils: Chai.ChaiUtils) => {
    return (_super: (...args: any[]) => any) => overwriteFractionAlmostEqual(_super, utils);
};

const overwriteFractionAlmostEqual = (_super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) => {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [
            expected,
            { maxAbsoluteError = new Decimal(0), maxRelativeError = new Decimal(0), relation = undefined }
        ] = args;
        const actual = chaiUtils.flag(this, 'object');

        expect(maxAbsoluteError).to.be.instanceOf(Decimal);
        expect(maxRelativeError).to.be.instanceOf(Decimal);

        let actualFraction;
        let expectedFraction;

        if (isFraction(actual) && isFraction(expected)) {
            actualFraction = toDecimal(actual) as Fraction<Decimal>;
            expectedFraction = toDecimal(expected) as Fraction<Decimal>;

            const x = actualFraction.n.mul(expectedFraction.d);
            const y = actualFraction.d.mul(expectedFraction.n);

            if (x.eq(y)) {
                return;
            }

            const actualDec = actualFraction.n.div(actualFraction.d);
            const expectedDec = expectedFraction.n.div(expectedFraction.d);

            switch (relation) {
                case Relation.LesserOrEqual:
                    this.assert(
                        actualDec.lte(expectedDec),
                        `Expected ${toString(actualFraction)} to be lesser than or equal to ${toString(
                            expectedFraction
                        )}`,
                        `Expected ${toString(actualFraction)} NOT to be lesser than or equal to ${toString(
                            expectedFraction
                        )}`,
                        toString(expectedFraction),
                        toString(actualFraction)
                    );
                    break;
                case Relation.GreaterOrEqual:
                    this.assert(
                        actualDec.gte(expectedDec),
                        `Expected ${toString(actualFraction)} to be greater than or equal to ${toString(
                            expectedFraction
                        )}`,
                        `Expected ${toString(actualFraction)} NOT to be greater than or equal to ${toString(
                            expectedFraction
                        )}`,
                        toString(expectedFraction),
                        toString(actualFraction)
                    );
                    break;
            }

            const absoluteError = actualDec.sub(expectedDec).abs();
            const relativeError = absoluteError.div(expectedDec);

            this.assert(
                absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError),
                `Expected ${actualDec.toFixed()} to be almost equal to ${expectedDec.toFixed()}:'
                '- absoluteError = ${absoluteError.toFixed()}'
                '- relativeError = ${relativeError.toFixed()}`,
                `Expected ${actualDec.toFixed()} NOT to be almost equal to ${expectedDec.toFixed()}:'
                '- absoluteError = ${absoluteError.toFixed()}'
                '- relativeError = ${relativeError.toFixed()}`,
                expectedDec.toFixed(),
                actualDec.toFixed()
            );
        } else {
            return _super.apply(this, args);
        }
    };
};

export default supportFraction;
