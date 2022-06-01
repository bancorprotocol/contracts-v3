import { ethers } from 'hardhat';

export * from '../../utils/Time';

export const latest = async () => {
    const block = await ethers.provider.getBlock('latest');
    return block.timestamp;
};

export const increaseTime = async (seconds: number) =>
    ethers.provider.send('evm_increaseTime', [ethers.utils.hexValue(seconds)]);
