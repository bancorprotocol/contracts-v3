import Contracts, { TestBlockNumber } from '../../components/Contracts';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('BlockNumber', () => {
    let blockNumber: TestBlockNumber;

    beforeEach(async () => {
        blockNumber = await Contracts.TestBlockNumber.deploy();
    });

    it('should return the time of the current block number', async () => {
        expect(await blockNumber.callStatic.realBlockNumber()).to.equal(
            (await ethers.provider.getBlock('latest')).number
        );
    });
});
