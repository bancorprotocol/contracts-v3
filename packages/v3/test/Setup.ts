import { customChai } from './matchers';
import '@nomiclabs/hardhat-waffle';
import chai from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { extendEnvironment } from 'hardhat/config';

// configure the global Decimal object
Decimal.set({ precision: 155, rounding: Decimal.ROUND_DOWN, toExpPos: 40 });

// patch BigNumber to include a min and a max functions
declare module 'ethers' {
    class BigNumber {
        static min(a: any, b: any): boolean;
        static max(a: any, b: any): boolean;
    }
}

BigNumber.min = (a: any, b: any) => (BigNumber.from(a).lt(b) ? a : b);
BigNumber.max = (a: any, b: any) => (BigNumber.from(a).lt(b) ? b : a);

extendEnvironment((hre) => {
    chai.use(customChai);
});
