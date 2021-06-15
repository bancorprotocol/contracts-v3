import { ethers } from 'hardhat';
import { BigNumber, BigNumberish } from 'ethers';

const advanceBlock = async () => {
    return await ethers.provider.send('evm_mine', []);
};

const latest = async () => {
    const block = await ethers.provider.getBlock('latest');
    return BigNumber.from(block.timestamp);
};

export default {
    advanceBlock,
    latest,
    duration: {
        seconds: function (val: BigNumberish) {
            return BigNumber.from(val);
        },
        minutes: function (val: BigNumberish) {
            return BigNumber.from(val).mul(this.seconds('60'));
        },
        hours: function (val: BigNumberish) {
            return BigNumber.from(val).mul(this.minutes('60'));
        },
        days: function (val: BigNumberish) {
            return BigNumber.from(val).mul(this.hours('24'));
        },
        weeks: function (val: BigNumberish) {
            return BigNumber.from(val).mul(this.days('7'));
        },
        years: function (val: BigNumberish) {
            return BigNumber.from(val).mul(this.days('365'));
        }
    }
};
