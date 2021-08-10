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

export default supportBigNumber;
