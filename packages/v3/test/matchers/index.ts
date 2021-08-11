import supportBigNumber from './BigNumber';
import supportFraction from './Fraction';
import Decimal from 'decimal.js';

declare global {
    export namespace Chai {
        interface Assertion {
            almostEqual(expected: any, maxAbsoluteError: Decimal, maxRelativeError: Decimal): void;
        }
    }
}

export const customChai = (chai: Chai.ChaiStatic, utils: Chai.ChaiUtils) => {
    supportBigNumber(chai.Assertion, utils);
    supportFraction(chai.Assertion, utils);
};
