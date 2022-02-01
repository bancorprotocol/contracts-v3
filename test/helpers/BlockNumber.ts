import { ethers } from 'hardhat';

export const latestBlockNumber = async () => {
    const block = await ethers.provider.getBlock('latest');
    return block.number;
};
