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
            const objBN = toBigNumber<BigNumber>(obj);
            const expectedBN = toBigNumber<BigNumber>(expected);

            this.assert(
                objBN.eq(expectedBN),
                `Expected ${objBN} to be ${readableName} ${expectedBN}`,
                `Expected ${objBN} NOT to be ${readableName} ${expectedBN}`,
                expectedBN.toString(),
                objBN.toString()
            );
        } else {
            _super.apply(this, args);
        }
    };
}

function overrideAlmostEqual(utils: Chai.ChaiUtils) {
    return (_super: (...args: never[]) => never) => overwriteBigNumberAlmostEqual(_super, utils);
}

function overwriteBigNumberAlmostEqual(_super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [expected, { maxAbsoluteError = new Decimal(0), maxRelativeError = new Decimal(0) }] = args;
        const obj = chaiUtils.flag(this, 'object');

        expect(maxAbsoluteError).to.be.instanceOf(Decimal);
        expect(maxRelativeError).to.be.instanceOf(Decimal);

        if (BigNumber.isBigNumber(obj) || BigNumber.isBigNumber(expected)) {
            const objDec = new Decimal(obj.toString());
            const expectedDec = new Decimal(expected.toString());

            if (objDec.eq(expectedDec)) {
                return;
            }

            const absoluteError = objDec.sub(expectedDec).abs();
            const relativeError = objDec.div(expectedDec).sub(1).abs();

            this.assert(
                absoluteError.lte(maxAbsoluteError) || relativeError.lte(maxRelativeError),
                `Expected ${objDec.toFixed()} to be almost equal to ${expectedDec.toFixed()} (absoluteError = ${absoluteError.toFixed()},
                relativeError = ${relativeError.toFixed(25)}`,
                `Expected ${objDec.toFixed()} NOT to be almost equal to to ${expectedDec.toFixed()} (absoluteError = ${absoluteError.toFixed()},
                relativeError = ${relativeError.toFixed(25)}`,
                expectedDec.toFixed(),
                objDec.toFixed()
            );
        } else {
            _super.apply(this, args);
        }
    };
}

export default supportBigNumber;
