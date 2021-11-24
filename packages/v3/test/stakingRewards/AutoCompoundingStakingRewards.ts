import Contracts from '../../components/Contracts';
import { AutoCompoundingStakingRewards } from '../../typechain-types';
import { ZERO_ADDRESS } from '../helpers/Constants';
import { createProxy } from '../helpers/Factory';
import Decimal from 'decimal.js';

const ONE = new Decimal(1);

const EXP_VAL_TOO_HIGH = 16;

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

describe('AutoCompoundingStakingRewards', () => {
    const TOTAL_REWARDS = 10_000_000;
    const TOTAL_DURATION = 10 * DAY;

    let autoCompoundingStakingRewards: AutoCompoundingStakingRewards;

    before(async () => {
        autoCompoundingStakingRewards = await createProxy(Contracts.AutoCompoundingStakingRewards);
    });

    it('', async () => {
        await autoCompoundingStakingRewards.createProgram(
            ZERO_ADDRESS,
            ZERO_ADDRESS,
            TOTAL_REWARDS,
            0,
            Date.now(),
            Date.now() + TOTAL_DURATION
        );
    });
});
