import Contracts, { TestStakingRewardsMath } from '../../components/Contracts';
import { ExponentialDecay } from '../../utils/Constants';
import { toWei } from '../../utils/Types';
import { duration } from '../helpers/Time';
import { Relation } from '../matchers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';

const { seconds, days, minutes, hours, years } = duration;

describe('StakingRewardsMath', () => {
    let stakingRewardsMath: TestStakingRewardsMath;

    before(async () => {
        stakingRewardsMath = await Contracts.TestStakingRewardsMath.deploy();
    });

    describe('flat rewards', () => {
        const calcFlatReward = (totalRewards: BigNumberish, timeElapsed: number, programDuration: number) => {
            it(`calcFlatRewards(${totalRewards}, ${timeElapsed}, ${programDuration})`, async () => {
                if (timeElapsed <= programDuration) {
                    const actual = await stakingRewardsMath.calcFlatRewards(totalRewards, timeElapsed, programDuration);
                    const expected = BigNumber.from(totalRewards).mul(timeElapsed).div(programDuration);
                    expect(actual).to.equal(expected);
                } else {
                    await expect(stakingRewardsMath.calcFlatRewards(totalRewards, timeElapsed, programDuration)).to.be
                        .reverted;
                    // TODO: test for the exact revert reason once the issue with ethers is fixed
                    // TODO: revertedWith('panic code 0x1 (Assertion error)')
                }
            });
        };

        describe('regular tests', () => {
            for (const totalRewards of [1_000, 10_000, 100_000, toWei(1_000), toWei(10_000), toWei(100_000)]) {
                for (const timeElapsed of [duration.hours(1), duration.days(1), duration.weeks(4)]) {
                    for (const programDuration of [duration.hours(12), duration.days(3), duration.weeks(12)]) {
                        calcFlatReward(totalRewards, timeElapsed, programDuration);
                    }
                }
            }
        });
    });

    describe('exponential-decay rewards', () => {
        const LAMBDA = ExponentialDecay.LAMBDA;
        const MAX_DURATION = ExponentialDecay.MAX_DURATION;

        const calcExpDecayRewards = (totalRewards: BigNumberish, timeElapsed: number) => {
            it(`calcExpDecayRewards(${totalRewards}, ${timeElapsed})`, async () => {
                if (timeElapsed <= MAX_DURATION) {
                    const actual = await stakingRewardsMath.calcExpDecayRewards(totalRewards, timeElapsed);
                    const expected = new Decimal(totalRewards.toString()).mul(
                        new Decimal(1).sub(LAMBDA.neg().mul(timeElapsed).exp())
                    );
                    await expect(actual).to.be.almostEqual(expected, {
                        maxAbsoluteError: new Decimal(1),
                        relation: Relation.LesserOrEqual
                    });
                } else {
                    await expect(stakingRewardsMath.calcExpDecayRewards(totalRewards, timeElapsed)).to.revertedWith(
                        'Overflow'
                    );
                }
            });
        };

        describe('regular tests', () => {
            for (const totalRewards of [50_000_000, toWei(40_000_000)]) {
                for (const timeElapsed of [
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
                    MAX_DURATION,
                    MAX_DURATION + 1
                ]) {
                    calcExpDecayRewards(totalRewards, timeElapsed);
                }
            }
        });

        describe('@stress tests', () => {
            for (const totalRewards of [
                40_000_000,
                400_000_000,
                4_000_000_000,
                toWei(50_000_000),
                toWei(500_000_000),
                toWei(5_000_000_000)
            ]) {
                for (let seconds = 0; seconds < 5; seconds++) {
                    for (let minutes = 0; minutes < 5; minutes++) {
                        for (let hours = 0; hours < 5; hours++) {
                            for (let days = 0; days < 5; days++) {
                                for (let years = 0; years < 5; years++) {
                                    calcExpDecayRewards(
                                        totalRewards,
                                        duration.seconds(seconds) +
                                            duration.minutes(minutes) +
                                            duration.hours(hours) +
                                            duration.days(days) +
                                            duration.years(years)
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
