/* eslint-disable @typescript-eslint/no-namespace */
import supportBigNumber from './BigNumber';
import supportFraction from './Fraction';
import Decimal from 'decimal.js';

declare global {
    export namespace Chai {
        interface AlmostEqualOptions {
            maxAbsoluteError?: Decimal;
            maxRelativeError?: Decimal;
        }
        interface Assertion {
            almostEqual(expected: any, options: AlmostEqualOptions): void;
        }
    }
}

export const customChai = (chai: Chai.ChaiStatic, utils: Chai.ChaiUtils) => {
    supportBigNumber(chai.Assertion, utils);
    supportFraction(chai.Assertion, utils);
};
