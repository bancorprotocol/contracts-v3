import Contracts from '../../components/Contracts';
import { TestStakingRewardsMath } from '../../typechain-types';
import { mulDivF } from '../helpers/MathUtils';
import { duration } from '../helpers/Time';
import { toWei } from '../helpers/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { EOL } from 'os';

const { seconds, days, minutes, hours, years } = duration;

const ONE = new Decimal(1);
const LAMBDA = new Decimal('0.0000000142857142857143');

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
            remainingRewards: number,
            minAccuracy = '0.999999999999999999'
        ) => {
            it(`processFlatReward(${timeElapsedSinceLastDistribution}, ${remainingProgramDuration}, ${remainingRewards})`, async () => {
                const actual = new Decimal(
                    (
                        await stakingRewardsMath.calculateFlatRewardsT(
                            timeElapsedSinceLastDistribution,
                            remainingProgramDuration,
                            remainingRewards
                        )
                    ).toString()
                );
                const expected = mulDivF(remainingRewards, timeElapsedSinceLastDistribution, remainingProgramDuration);

                assertAccuracy(actual, expected, minAccuracy);
            });
        };

        describe('regular tests', () => {
            calculateFlatRewardTest(1000, 10000, 10000);
        });
    });

    describe('exponential Decay', () => {
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
            totalRewards: number,
            minAccuracy: string
        ) => {
            it(`processExponentialDecayReward(${numOfSeconds}, ${totalRewards})`, async () => {
                const totalRewardsInWei = toWei(BigNumber.from(totalRewards));
                if (numOfSeconds < SECONDS_TOO_HIGH) {
                    const actual = new Decimal(
                        (
                            await stakingRewardsMath.calculateExponentialDecayRewardsAfterTimeElapsedT(
                                numOfSeconds,
                                totalRewardsInWei
                            )
                        ).toString()
                    );
                    const expected = new Decimal(totalRewardsInWei.toString()).mul(
                        ONE.sub(LAMBDA.neg().mul(numOfSeconds).exp())
                    );
                    assertAccuracy(actual, expected, minAccuracy);
                } else {
                    await expect(
                        stakingRewardsMath.calculateExponentialDecayRewardsAfterTimeElapsedT(
                            numOfSeconds,
                            totalRewardsInWei
                        )
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
                calculateExponentialDecayRewardsAfterTimeElapsedTest(numOfSeconds, 40_000_000, '0.999999999999999999');
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
                                for (const totalRewards of [40_000_000, 400_000_000, 4_000_000_000]) {
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

    describe('pool token amount to burn', () => {
        const calculatePoolTokenAmountToBurnTest = (
            a: BigNumber,
            b: BigNumber,
            c: BigNumber,
            d: BigNumber,
            minAccuracy = '0.999999999999999999'
        ) => {
            it(`calculatePoolTokenAmountToBurn(${a}, ${b}, ${c},  ${d})`, async () => {
                const actual = new Decimal(
                    (await stakingRewardsMath.calculatePoolTokenAmountToBurnT(a, b, c, d)).toString()
                );

                const bc = b.mul(c);
                const expected = bc.mul(c).div(a.mul(c.sub(d)).add(bc));
                assertAccuracy(actual, new Decimal(expected.toString()), minAccuracy);
            });
        };

        describe('regular tests', () => {
            calculatePoolTokenAmountToBurnTest(
                BigNumber.from(1000),
                BigNumber.from(1000),
                BigNumber.from(1000),
                BigNumber.from(1000)
            );
        });
    });
});
