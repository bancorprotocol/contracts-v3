import Contracts from '../../components/Contracts';
import { TestStakingRewards } from '../../typechain';
import Decimal from 'decimal.js';
import { expect } from 'chai';

const ONE    = new Decimal(1);
const LAMBDA = new Decimal(2).div(10000000);

const assertAccuracy = (actual: Decimal, expected: Decimal, minAccuracy: string) => {
    const accuracy = actual.div(expected);
    expect(accuracy.gte(minAccuracy) && accuracy.lte(1)).to.equal(true,
        `\nexpected = ${expected.toFixed(minAccuracy.length)}` +
        `\nactual   = ${actual.toFixed(minAccuracy.length)}` +
        `\naccuracy = ${accuracy.toFixed(minAccuracy.length)}`
    );
};

describe('StakingRewards', () => {
    let stakingRewards: TestStakingRewards;

    const expTest = (a: number, b: number, minAccuracy: string) => {
        it(`exp(${a}, ${b})`, async () => {
            if (a / b < 2) {
                const retval = await stakingRewards.expT(a, b);
                const actual = new Decimal(retval[0].toString()).div(retval[1].toString());
                const expected = new Decimal(a).div(b).exp();
                assertAccuracy(actual, expected, minAccuracy);
            }
            else {
                await expect(stakingRewards.expT(a, b)).to.revertedWith('ERR_EXP_VAL_TOO_HIGH');
            }
        });
    };

    const rewardTest = (remainingRewards: string, numOfBlocksElapsed: string, minAccuracy: string) => {
        it(`reward(${remainingRewards}, ${numOfBlocksElapsed})`, async () => {
            const actual = new Decimal((await stakingRewards.rewardT(remainingRewards, numOfBlocksElapsed)).toString());
            const expected = new Decimal(remainingRewards).mul(ONE.sub(LAMBDA.neg().mul(numOfBlocksElapsed).exp()));
            assertAccuracy(actual, expected, minAccuracy);
        });
    };

    before(async () => {
        stakingRewards = await Contracts.TestStakingRewards.deploy();
    });

    for (let a = 0; a < 100; a++) {
        for (let b = 1; b < 100; b++) {
            expTest(a, b, '0.9999999999999999999999999999999999999');
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

    for (const remainingRewards of [1, 2, 3, 4, 5, 6].map(n => `${n}`.repeat(21 + n))) {
        for (const numOfBlocksElapsed of [0, 1, 2, 3, 4, 5, 6].map(n => '1' + '0'.repeat(n))) {
            rewardTest(remainingRewards, numOfBlocksElapsed, '0.99999999999999');
        }
    }
});
