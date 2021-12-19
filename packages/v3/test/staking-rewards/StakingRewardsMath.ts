import Contracts from '../../components/Contracts';
import { TestStakingRewardsMath } from '../../typechain-types';
import { ExponentialDecay } from '../helpers/Constants';
import { duration } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';
import { EOL } from 'os';

const { seconds, days, minutes, hours, years } = duration;
const { ONE, LAMBDA } = ExponentialDecay;

const EXP_VAL_TOO_HIGH = 16;
const SECONDS_TOO_HIGH = ONE.div(LAMBDA).mul(EXP_VAL_TOO_HIGH).ceil().toNumber();

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

describe('StakingRewardsMath', () => {
    let stakingRewardsMath: TestStakingRewardsMath;

    before(async () => {
        stakingRewardsMath = await Contracts.TestStakingRewardsMath.deploy();
    });

    describe('flat', () => {
        const calculateFlatRewardTest = (
            timeElapsedSinceLastDistribution: number,
            remainingProgramDuration: number,
            remainingRewards: number
        ) => {
            it(`calculateFlatRewards(${timeElapsedSinceLastDistribution}, ${remainingProgramDuration}, ${remainingRewards})`, async () => {
                const actual = await stakingRewardsMath.calculateFlatRewardsT(
                    timeElapsedSinceLastDistribution,
                    remainingProgramDuration,
                    remainingRewards
                );
                const expected = BigNumber.from(remainingRewards)
                    .mul(timeElapsedSinceLastDistribution)
                    .div(remainingProgramDuration);

                expect(actual).to.equal(expected);
            });
        };

        describe('regular tests', () => {
            calculateFlatRewardTest(1000, 10000, 10000);
        });
    });

    describe('exponential decay', () => {
        const expTest = (a: number, b: number, minAccuracy: string) => {
            it(`exp(${a}, ${b})`, async () => {
                if (a / b < EXP_VAL_TOO_HIGH) {
                    const retVal = await stakingRewardsMath.expT(a, b);
                    const actual = new Decimal(retVal[0].toString()).div(retVal[1].toString());
                    const expected = new Decimal(a).div(b).exp();
                    assertAccuracy(actual, expected, minAccuracy);
                } else {
                    await expect(stakingRewardsMath.expT(a, b)).to.revertedWith('ExpValueTooHigh');
                }
            });
        };

        const calculateExponentialDecayRewardsAfterTimeElapsedTest = (
            numOfSeconds: number,
            totalRewards: BigNumberish,
            minAccuracy: string
        ) => {
            it(`calculateExponentialDecayRewardsAfterTimeElapsed(${numOfSeconds}, ${totalRewards.toString()})`, async () => {
                if (numOfSeconds < SECONDS_TOO_HIGH) {
                    const actual = new Decimal(
                        (
                            await stakingRewardsMath.calculateExponentialDecayRewardsAfterTimeElapsedT(
                                numOfSeconds,
                                totalRewards
                            )
                        ).toString()
                    );
                    const expected = new Decimal(totalRewards.toString()).mul(
                        ONE.sub(LAMBDA.neg().mul(numOfSeconds).exp())
                    );
                    assertAccuracy(actual, expected, minAccuracy);
                } else {
                    await expect(
                        stakingRewardsMath.calculateExponentialDecayRewardsAfterTimeElapsedT(numOfSeconds, totalRewards)
                    ).to.revertedWith('ExpValueTooHigh');
                }
            });
        };

        describe('regular tests', () => {
            for (let a = 0; a < 10; a++) {
                for (let b = 1; b < 10; b++) {
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
                seconds(1),
                seconds(10),
                minutes(1),
                minutes(10),
                hours(1),
                hours(10),
                days(1),
                days(10),
                days(100),
                years(1),
                years(2),
                years(4),
                years(8),
                years(16),
                years(32),
                SECONDS_TOO_HIGH - 1,
                SECONDS_TOO_HIGH
            ]) {
                calculateExponentialDecayRewardsAfterTimeElapsedTest(
                    numOfSeconds,
                    toWei(40_000_000),
                    '0.999999999999999999'
                );
            }
        });

        describe('@stress tests', () => {
            for (let a = 0; a < 100; a++) {
                for (let b = 1; b < 100; b++) {
                    expTest(a, b, '0.99999999999999999999999999999999999');
                }
            }

            for (let seconds = 0; seconds < 5; seconds++) {
                for (let minutes = 0; minutes < 5; minutes++) {
                    for (let hours = 0; hours < 5; hours++) {
                        for (let days = 0; days < 5; days++) {
                            for (let years = 0; years < 5; years++) {
                                for (const totalRewards of [
                                    40_000_000,
                                    400_000_000,
                                    4_000_000_000,
                                    toWei(50_000_000),
                                    toWei(500_000_000),
                                    toWei(5_000_000_000)
                                ]) {
                                    calculateExponentialDecayRewardsAfterTimeElapsedTest(
                                        duration.seconds(seconds) +
                                            duration.minutes(minutes) +
                                            duration.hours(hours) +
                                            duration.days(days) +
                                            duration.years(years),
                                        totalRewards,
                                        '0.999999999999999999'
                                    );
                                }
                            }
                        }
                    }
                }
            }
        });
    });
});
