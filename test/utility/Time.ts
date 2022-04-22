import Contracts, { TestTime } from '../../components/Contracts';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Time', () => {
    let time: TestTime;

    beforeEach(async () => {
        time = await Contracts.TestTime.deploy();
    });

    it('should return the time of the current block', async () => {
        expect(await time.callStatic.realTime()).to.equal((await ethers.provider.getBlock('latest')).timestamp);
    });
});
