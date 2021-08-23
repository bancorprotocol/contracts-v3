import Contracts from '../../components/Contracts';
import { TestStakingRewards } from '../../typechain';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { EOL } from 'os';

const ONE = new Decimal(1);
const LAMBDA = new Decimal('0.0000000142857142857143');
const TOTAL_REWARDS = new Decimal('4e25'); // 40 million + 18 decimals

const EXP_VAL_TOO_HIGH = 16;
const SECONDS_TOO_HIGH = ONE.div(LAMBDA).mul(EXP_VAL_TOO_HIGH).ceil().toNumber();

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

const assertAccuracy = (actual: Decimal, expected: Decimal, minAccuracy: string) => {
    if (!actual.eq(expected)) {
        const accuracy = actual.div(expected);
        expect(accuracy.gte(minAccuracy) && accuracy.lte(1)).to.equal(
            true,
            EOL +
                [
                    `expected = ${expected.toFixed(minAccuracy.length)}`,
                    `actual   = ${actual.toFixed(minAccuracy.length)}`,
                    `accuracy = ${accuracy.toFixed(minAccuracy.length)}`
                ].join(EOL)
        );
    }
};

describe('StakingRewards formula', () => {
    let stakingRewards: TestStakingRewards;

    before(async () => {
        stakingRewards = await Contracts.TestStakingRewards.deploy();
    });

    const expTest = (a: number, b: number, minAccuracy: string) => {
        it(`exp(${a}, ${b})`, async () => {
            if (a / b < EXP_VAL_TOO_HIGH) {
                const retval = await stakingRewards.expT(a, b);
                const actual = new Decimal(retval[0].toString()).div(retval[1].toString());
                const expected = new Decimal(a).div(b).exp();
                assertAccuracy(actual, expected, minAccuracy);
            } else {
                await expect(stakingRewards.expT(a, b)).to.revertedWith('ERR_EXP_VAL_TOO_HIGH');
            }
        });
    };

    const rewardTest = (numOfSeconds: number, minAccuracy: string) => {
        it(`reward(${numOfSeconds})`, async () => {
            if (numOfSeconds < SECONDS_TOO_HIGH) {
                const actual = new Decimal((await stakingRewards.rewardT(numOfSeconds)).toString());
                const expected = TOTAL_REWARDS.mul(ONE.sub(LAMBDA.neg().mul(numOfSeconds).exp()));
                assertAccuracy(actual, expected, minAccuracy);
            } else {
                await expect(stakingRewards.rewardT(numOfSeconds)).to.revertedWith('ERR_EXP_VAL_TOO_HIGH');
            }
        });
    };

    describe('regular tests:', () => {
    for (let a = 0; a < 100; a++) {
        for (let b = 1; b < 100; b++) {
            expTest(a, b, '0.99999999999999999999999999999999999');
        }
    }

    for (let b = 1000; b < 1000000000; b *= 10) {
        for (let a = 1; a <= 10; a++) {
            expTest(a, b, '0.9999999999999999999999999999999999999');
        }
    }

    for (let b = 1000; b < 1000000000; b *= 10) {
        for (let a = b - 10; a <= b - 1; a++) {
            expTest(a, b, '0.9999999999999999999999999999999999999');
        }
    }

    for (let b = 1000; b < 1000000000; b *= 10) {
        for (let a = b + 1; a <= b + 10; a++) {
            expTest(a, b, '0.9999999999999999999999999999999999999');
        }
    }

    for (let b = 1000; b < 1000000000; b *= 10) {
        for (let a = 2 * b - 10; a <= 2 * b - 1; a++) {
            expTest(a, b, '0.9999999999999999999999999999999999999');
        }
    }

    for (let b = 1000; b < 1000000000; b *= 10) {
        for (let a = 2 * b + 1; a <= 2 * b + 10; a++) {
            expTest(a, b, '0.9999999999999999999999999999999999999');
        }
    }

    for (let b = 1000; b < 1000000000; b *= 10) {
        for (let a = EXP_VAL_TOO_HIGH * b - 10; a <= EXP_VAL_TOO_HIGH * b - 1; a++) {
            expTest(a, b, '0.99999999999999999999999999999999999');
        }
    }

    for (const numOfSeconds of [
        0,
        1 * SECOND,
        10 * SECOND,
        1 * MINUTE,
        10 * MINUTE,
        1 * HOUR,
        10 * HOUR,
        1 * DAY,
        10 * DAY,
        100 * DAY,
        1 * YEAR,
        2 * YEAR,
        4 * YEAR,
        8 * YEAR,
        16 * YEAR,
        32 * YEAR,
        SECONDS_TOO_HIGH - 1,
        SECONDS_TOO_HIGH
    ]) {
        rewardTest(numOfSeconds, '0.999999999999999999');
    }
});
});
