import { customChai } from './matchers';
import chai from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

chai.use(customChai);

// configure the global Decimal object
Decimal.set({ precision: 155, rounding: Decimal.ROUND_DOWN, toExpPos: 40 });

// patch BigNumber to include a min and a max functions
declare module 'ethers' {
    class BigNumber {
        static min(a: any, b: any): boolean;
        static max(a: any, b: any): boolean;
    }
}

BigNumber.min = (a: any, b: any) => (BigNumber.from(a).gt(b) ? b : a);
BigNumber.max = (a: any, b: any) => (BigNumber.from(a).gt(b) ? a : b);
