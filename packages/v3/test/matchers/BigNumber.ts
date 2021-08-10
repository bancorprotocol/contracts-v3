import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const supportBigNumber = (Assertion: Chai.AssertionStatic, utils: Chai.ChaiUtils) => {
    Assertion.overwriteMethod('equals', override('equal', utils));
    Assertion.overwriteMethod('equal', override('equal', utils));
    Assertion.overwriteMethod('eq', override('equal', utils));
};

function override(name: string, utils: Chai.ChaiUtils) {
    return (_super: (...args: any[]) => any) => overwriteBigNumberFunction(name, _super, utils);
}

function overwriteBigNumberFunction(readableName: string, _super: (...args: any[]) => any, chaiUtils: Chai.ChaiUtils) {
    return function (this: Chai.AssertionStatic, ...args: any[]) {
        const [actual] = args;
        const expected = chaiUtils.flag(this, 'object');

        if (BigNumber.isBigNumber(expected) || BigNumber.isBigNumber(actual)) {
            let expectedBN = BigNumber.from(Decimal.isDecimal(expected) ? expected.toFixed() : expected);
            let actualBN = BigNumber.from(Decimal.isDecimal(actual) ? actual.toFixed() : actual);

            this.assert(
                BigNumber.from(expectedBN).eq(actualBN),
                `Expected ${expectedBN} to be ${readableName} ${actualBN}`,
                `Expected ${expectedBN} NOT to be ${readableName} ${actualBN}`,
                expectedBN,
                actualBN
            );
        } else {
            _super.apply(this, args);
        }
    };
}

export default supportBigNumber;
