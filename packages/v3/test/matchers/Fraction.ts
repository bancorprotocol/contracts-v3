import { toDecimal, toString, isFraction, Fraction } from '../helpers/Types';
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

function overwriteFractionFunction(readableName: string, _super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [expected] = args;
        const obj = chaiUtils.flag(this, 'object');

        if (isFraction(obj) && isFraction(expected)) {
            const objDec = toDecimal(obj) as Fraction<Decimal>;
            const expectedDec = toDecimal(expected) as Fraction<Decimal>;

            // if neither of the denominators are zero - compare the result of the division. Otherwise, co an explicit
            // comparison
            let res;
            if (!objDec.d.isZero() && !expectedDec.d.isZero()) {
                res = objDec.n.div(objDec.d).eq(expectedDec.n.div(expectedDec.d));
            } else {
                res = objDec.n.eq(expectedDec.n) && objDec.d.eq(expectedDec.d);
            }

            this.assert(
                res,
                `Expected ${toString(objDec)} to be ${readableName} to ${toString(expectedDec)}`,
                `Expected ${toString(objDec)} NOT to be ${readableName} to ${toString(expectedDec)}`,
                toString(expectedDec),
                toString(objDec)
            );
        } else {
            _super.apply(this, args);
        }
    };
}

function overrideAlmostEqual(utils: Chai.ChaiUtils) {
    return (_super: (...args: any[]) => any) => overwriteFractionAlmostEqual(_super, utils);
}

function overwriteFractionAlmostEqual(_super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [
            expected,
            { maxAbsoluteError = new Decimal(0), maxRelativeError = new Decimal(0), relation = undefined }
        ] = args;
        const obj = chaiUtils.flag(this, 'object');

        expect(maxAbsoluteError).to.be.instanceOf(Decimal);
        expect(maxRelativeError).to.be.instanceOf(Decimal);

        let objFraction;
        let expectedFraction;

        if (isFraction(obj) && isFraction(expected)) {
            objFraction = toDecimal(obj) as Fraction<Decimal>;
            expectedFraction = toDecimal(expected) as Fraction<Decimal>;

            const x = objFraction.n.mul(expectedFraction.d);
            const y = objFraction.d.mul(expectedFraction.n);

            if (x.eq(y)) {
                return;
            }

            const objDec = objFraction.n.div(objFraction.d);
            const expectedDec = expectedFraction.n.div(expectedFraction.d);

            switch (relation) {
                case Relation.LesserOrEqual:
                    this.assert(
                        objDec.lte(expectedDec),
                        `Expected ${toString(objFraction)} to be lesser than or equal to ${toString(expectedFraction)}`,
                        `Expected ${toString(objFraction)} NOT to be lesser than or equal to ${toString(
                            expectedFraction
                        )}`,
                        toString(expectedFraction),
                        toString(objFraction)
                    );
                    break;
                case Relation.GreaterOrEqual:
                    this.assert(
                        objDec.gte(expectedDec),
                        `Expected ${toString(objFraction)} to be greater than or equal to ${toString(
                            expectedFraction
                        )}`,
                        `Expected ${toString(objFraction)} NOT to be greater than or equal to ${toString(
                            expectedFraction
                        )}`,
                        toString(expectedFraction),
                        toString(objFraction)
                    );
                    break;
            }

            const absoluteError = objDec.sub(expectedDec).abs();
            const relativeError = absoluteError.div(expectedDec);

            this.assert(
                absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError),
                `Expected ${objDec.toFixed()} to be almost equal to ${expectedDec.toFixed()}:'
                '- absoluteError = ${absoluteError.toFixed()}'
                '- relativeError = ${relativeError.toFixed()}`,
                `Expected ${objDec.toFixed()} NOT to be almost equal to ${expectedDec.toFixed()}:'
                '- absoluteError = ${absoluteError.toFixed()}'
                '- relativeError = ${relativeError.toFixed()}`,
                expectedDec.toFixed(),
                objDec.toFixed()
            );
        } else {
            return _super.apply(this, args);
        }
    };
}

export default supportFraction;
