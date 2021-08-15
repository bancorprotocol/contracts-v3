import { toBigNumber } from '../helpers/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const supportBigNumber = (Assertion: Chai.AssertionStatic, utils: Chai.ChaiUtils) => {
    Assertion.overwriteMethod('equals', override('equal', utils));
    Assertion.overwriteMethod('equal', override('equal', utils));
    Assertion.overwriteMethod('eq', override('equal', utils));
    Assertion.overwriteMethod('almostEqual', overrideAlmostEqual(utils));
};

function override(name: string, utils: Chai.ChaiUtils) {
    return (_super: (...args: any[]) => any) => overwriteBigNumberFunction(name, _super, utils);
}

function overwriteBigNumberFunction(readableName: string, _super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [expected] = args;
        const obj = chaiUtils.flag(this, 'object');

        if (BigNumber.isBigNumber(obj) || BigNumber.isBigNumber(expected)) {
            let objBN = BigNumber.from(Decimal.isDecimal(obj) ? obj.toFixed() : obj);
            let expectedBN = BigNumber.from(Decimal.isDecimal(expected) ? expected.toFixed() : expected);

            this.assert(
                BigNumber.from(objBN).eq(expectedBN),
                `Expected ${objBN} to be ${readableName} ${expectedBN}`,
                `Expected ${objBN} NOT to be ${readableName} ${expectedBN}`,
                objBN,
                expectedBN
            );
        } else {
            _super.apply(this, args);
        }
    };
}

function overrideAlmostEqual(utils: Chai.ChaiUtils) {
    return (_super: (...args: any[]) => any) => overwriteBigNumberAlmostEqual(_super, utils);
}

function overwriteBigNumberAlmostEqual(_super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [expected, maxAbsoluteError, maxRelativeError] = args;
        const obj = chaiUtils.flag(this, 'object');

        expect(maxAbsoluteError).to.be.instanceOf(Decimal);
        expect(maxRelativeError).to.be.instanceOf(Decimal);

        if (BigNumber.isBigNumber(obj) || BigNumber.isBigNumber(expected)) {
            let objBN = toBigNumber(obj);
            let expectedBN = toBigNumber(expected);

            const x = new Decimal(objBN.toString());
            const y = new Decimal(expectedBN.toString());

            if (x.eq(y)) {
                return;
            }

            const absoluteError = x.sub(y).abs();
            const relativeError = x.div(y).sub(1).abs();

            this.assert(
                absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError),
                `Expected ${objBN.toString()} to be almost equal to ${expectedBN.toString()} (absoluteError = ${absoluteError.toFixed()}, relativeError = ${relativeError.toFixed(
                    25
                )}`,
                `Expected ${objBN.toString()} NOT to be almost equal to to ${expectedBN.toString()} (absoluteError = ${absoluteError.toFixed()}, relativeError = ${relativeError.toFixed(
                    25
                )}`,
                objBN,
                expectedBN
            );
        } else {
            _super.apply(this, args);
        }
    };
}

export default supportBigNumber;
