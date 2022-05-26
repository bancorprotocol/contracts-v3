/* eslint-disable @typescript-eslint/no-namespace */
import supportBigNumber from './BigNumber';
import supportFraction from './Fraction';
import supportRevertedWithError from './RevertedWithError';
import Decimal from 'decimal.js';

export enum Relation {
    LesserOrEqual,
    GreaterOrEqual
}

export interface AlmostEqualOptions {
    maxAbsoluteError?: Decimal;
    maxRelativeError?: Decimal;
    relation?: Relation;
}

declare global {
    export namespace Chai {
        interface Assertion {
            almostEqual(expected: any, options: AlmostEqualOptions): void;
            revertedWithError(reason: string): AsyncAssertion;
        }
    }
}

export const customChai = (chai: Chai.ChaiStatic, utils: Chai.ChaiUtils) => {
    supportBigNumber(chai.Assertion, utils);
    supportFraction(chai.Assertion, utils);
    supportRevertedWithError(chai.Assertion);
};
