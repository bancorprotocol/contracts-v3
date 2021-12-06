import Contracts from '../../components/Contracts';
import { TestStakingRewardsMath } from '../../typechain-types';
import { mulDivF } from '../helpers/MathUtils';
import { toWei } from '../helpers/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import { EOL } from 'os';

const ONE = new Decimal(1);
const LAMBDA = new Decimal('0.0000000142857142857143');

const EXP_VAL_TOO_HIGH = 16;
const SECONDS_TOO_HIGH = ONE.div(LAMBDA).mul(EXP_VAL_TOO_HIGH).ceil().toNumber();

const SECOND = 1;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
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

describe('StakingRewardsMath', () => {
    let stakingRewardsMath: TestStakingRewardsMath;

    before(async () => {
        stakingRewardsMath = await Contracts.TestStakingRewardsMath.deploy();
    });

    describe('Exponential Decay', () => {
        const expTest = (a: number, b: number, minAccuracy: string) => {
            it(`exp(${a}, ${b})`, async () => {
                if (a / b < EXP_VAL_TOO_HIGH) {
                    const retval = await stakingRewardsMath.expT(a, b);
                    const actual = new Decimal(retval[0].toString()).div(retval[1].toString());
                    const expected = new Decimal(a).div(b).exp();
                    assertAccuracy(actual, expected, minAccuracy);
                } else {
                    await expect(stakingRewardsMath.expT(a, b)).to.revertedWith('ERR_EXP_VAL_TOO_HIGH');
                }
            });
        };

        const processExponentialDecayRewardTest = (numOfSeconds: number, totalRewards: number, minAccuracy: string) => {
            it(`processExponentialDecayReward(${numOfSeconds}, ${totalRewards})`, async () => {
                const totalRewardsInWei = toWei(BigNumber.from(totalRewards));
                if (numOfSeconds < SECONDS_TOO_HIGH) {
                    const actual = new Decimal(
                        (
                            await stakingRewardsMath.processExponentialDecayRewardT(numOfSeconds, totalRewardsInWei)
                        ).toString()
                    );
                    const expected = new Decimal(totalRewardsInWei.toString()).mul(
                        ONE.sub(LAMBDA.neg().mul(numOfSeconds).exp())
                    );
                    assertAccuracy(actual, expected, minAccuracy);
                } else {
                    await expect(
                        stakingRewardsMath.processExponentialDecayRewardT(numOfSeconds, totalRewardsInWei)
                    ).to.revertedWith('ERR_EXP_VAL_TOO_HIGH');
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
                processExponentialDecayRewardTest(numOfSeconds, 40_000_000, '0.999999999999999999');
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
                                    processExponentialDecayRewardTest(
                                        seconds * SECOND + minutes * MINUTE + hours * HOUR + days * DAY + years * YEAR,
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

    describe('Flat', () => {
        const processFlatRewardTest = (
            timeElapsedSinceLastDistribution: number,
            remainingProgramTime: number,
            availableRewards: number,
            minAccuracy: string
        ) => {
            it(`processFlatReward(${timeElapsedSinceLastDistribution}, ${remainingProgramTime}, ${availableRewards})`, async () => {
                const actual = new Decimal(
                    (
                        await stakingRewardsMath.processFlatRewardT(
                            timeElapsedSinceLastDistribution,
                            remainingProgramTime,
                            availableRewards
                        )
                    ).toString()
                );
                const expected = mulDivF(availableRewards, timeElapsedSinceLastDistribution, remainingProgramTime);

                assertAccuracy(actual, expected, minAccuracy);
            });
        };

        describe('regular tests', () => {
            processFlatRewardTest(1000, 10000, 10000, '0.999999999999999999');
        });
    });

    describe('Process Pool Token Burn', () => {
        const processPoolTokenToBurnTest = (
            a: BigNumber,
            b: BigNumber,
            c: BigNumber,
            d: BigNumber,
            minAccuracy: string
        ) => {
            it(`processPoolTokenToBurn(${a}, ${b}, ${c},  ${d})`, async () => {
                const actual = new Decimal((await stakingRewardsMath.processPoolTokenToBurnT(a, b, c, d)).toString());

                const bc = b.mul(c);
                const expected = mulDivF(bc, c, a.mul(c.sub(d)).add(bc));
                assertAccuracy(actual, expected, minAccuracy);
            });
        };

        describe('regular tests', () => {
            processPoolTokenToBurnTest(
                BigNumber.from(1000),
                BigNumber.from(1000),
                BigNumber.from(1000),
                BigNumber.from(1000),
                '0.999999999999999999'
            );
        });
    });
});
