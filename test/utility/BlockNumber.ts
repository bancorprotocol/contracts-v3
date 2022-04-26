import Contracts, { TestBlockNumber } from '../../components/Contracts';
import { latestBlockNumber } from '../helpers/BlockNumber';
import { expect } from 'chai';

describe('BlockNumber', () => {
    let blockNumber: TestBlockNumber;

    beforeEach(async () => {
        blockNumber = await Contracts.TestBlockNumber.deploy();
    });

    it('should return the time of the current block number', async () => {
        expect(await blockNumber.callStatic.realBlockNumber()).to.equal(await latestBlockNumber());
    });
});
