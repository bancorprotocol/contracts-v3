import { ethers } from 'hardhat';

export * from '../../utils/Time';

export const advanceBlock = async () => {
    return await ethers.provider.send('evm_mine', []);
};

export const latest = async () => {
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp;
};
