import { customChai } from './matchers';
import '@nomiclabs/hardhat-waffle';
import chai from 'chai';
import Decimal from 'decimal.js';
import { extendEnvironment } from 'hardhat/config';

// configure the global Decimal object
Decimal.set({ precision: 155, rounding: Decimal.ROUND_DOWN, toExpPos: 40 });

extendEnvironment(() => {
    chai.use(customChai);
});
