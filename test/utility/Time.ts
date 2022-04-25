import Contracts, { TestTime } from '../../components/Contracts';
import { latest } from '../helpers/Time';
import { expect } from 'chai';

describe('Time', () => {
    let time: TestTime;

    beforeEach(async () => {
        time = await Contracts.TestTime.deploy();
    });

    it('should return the time of the current block', async () => {
        expect(await time.callStatic.realTime()).to.equal(await latest());
    });
});
