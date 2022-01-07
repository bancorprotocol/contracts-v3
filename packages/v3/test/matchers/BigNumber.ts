import { toBigNumber } from '../../utils/Types';
import { Relation } from '../matchers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const supportBigNumber = (Assertion: Chai.AssertionStatic, utils: Chai.ChaiUtils) => {
    Assertion.overwriteMethod('equals', override('equal', utils));
    Assertion.overwriteMethod('equal', override('equal', utils));
    Assertion.overwriteMethod('eq', override('equal', utils));
    Assertion.overwriteMethod('almostEqual', overrideAlmostEqual(utils));
};

const override = (name: string, utils: Chai.ChaiUtils) => {
    return (_super: (...args: any[]) => any) => overwriteBigNumberFunction(name, _super, utils);
};

const overwriteBigNumberFunction = (
    readableName: string,
    _super: (...args: any[]) => any,
    chaiUtils: Chai.ChaiUtils
) => {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [expected] = args;
        const actual = chaiUtils.flag(this, 'object');

        if (BigNumber.isBigNumber(actual) || BigNumber.isBigNumber(expected)) {
            const actualBN = toBigNumber<BigNumber>(actual);
            const expectedBN = toBigNumber<BigNumber>(expected);

            this.assert(
                actualBN.eq(expectedBN),
                `Expected ${actualBN} to be ${readableName} ${expectedBN}`,
                `Expected ${actualBN} NOT to be ${readableName} ${expectedBN}`,
                expectedBN.toString(),
                actualBN.toString()
            );
        } else {
            _super.apply(this, args);
        }
    };
};

const overrideAlmostEqual = (utils: Chai.ChaiUtils) => {
    return (_super: (...args: never[]) => never) => overwriteBigNumberAlmostEqual(_super, utils);
};

const overwriteBigNumberAlmostEqual = (_super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) => {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [
            expected,
            { maxAbsoluteError = new Decimal(0), maxRelativeError = new Decimal(0), relation = undefined }
        ] = args;
        const actual = chaiUtils.flag(this, 'object');

        expect(maxAbsoluteError).to.be.instanceOf(Decimal);
        expect(maxRelativeError).to.be.instanceOf(Decimal);

        if (BigNumber.isBigNumber(actual) || BigNumber.isBigNumber(expected)) {
            const actualDec = new Decimal(actual.toString());
            const expectedDec = new Decimal(expected.toString());

            if (actualDec.eq(expectedDec)) {
                return;
            }

            switch (relation) {
                case Relation.LesserOrEqual:
                    this.assert(
                        actualDec.lte(expectedDec),
                        `Expected ${actualDec} to be lesser than or equal to ${expectedDec}`,
                        `Expected ${actualDec} NOT to be lesser than or equal to ${expectedDec}`,
                        expectedDec.toString(),
                        actualDec.toString()
                    );
                    break;
                case Relation.GreaterOrEqual:
                    this.assert(
                        actualDec.gte(expectedDec),
                        `Expected ${actualDec} to be greater than or equal to ${expectedDec}`,
                        `Expected ${actualDec} NOT to be greater than or equal to ${expectedDec}`,
                        expectedDec.toString(),
                        actualDec.toString()
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
            _super.apply(this, args);
        }
    };
};

export default supportBigNumber;
