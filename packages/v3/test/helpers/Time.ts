import { ethers } from 'hardhat';

export const advanceBlock = async () => {
    return await ethers.provider.send('evm_mine', []);
};

export const latest = async () => {
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp;
};

const seconds = (val: number) => {
    return val;
};

const minutes = (val: number) => {
    return val * seconds(60);
};

const hours = (val: number) => {
    return val * minutes(60);
};

const days = (val: number) => {
    return val * hours(24);
};

const weeks = (val: number) => {
    return val * days(7);
};

const years = (val: number) => {
    return val * days(365);
};

export const duration = { seconds, minutes, hours, days, weeks, years };
