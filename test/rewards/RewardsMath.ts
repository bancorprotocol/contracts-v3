import Contracts, { TestRewardsMath } from '../../components/Contracts';
import { EXP2_INPUT_TOO_HIGH } from '../../utils/Constants';
import { toWei } from '../../utils/Types';
import { duration } from '../helpers/Time';
import { Relation } from '../matchers';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';

const { seconds, days, minutes, hours, years } = duration;

describe('RewardsMath', () => {
    let rewardsMath: TestRewardsMath;

    before(async () => {
        rewardsMath = await Contracts.TestRewardsMath.deploy();
    });

    describe('flat rewards', () => {
        const calcFlatReward = (totalRewards: BigNumberish, timeElapsed: number, programDuration: number) => {
            it(`calcFlatRewards(${totalRewards}, ${timeElapsed}, ${programDuration})`, async () => {
                if (timeElapsed <= programDuration) {
                    const actual = await rewardsMath.calcFlatRewards(totalRewards, timeElapsed, programDuration);
                    const expected = BigNumber.from(totalRewards).mul(timeElapsed).div(programDuration);
                    expect(actual).to.equal(expected);
                } else {
                    await expect(
                        rewardsMath.calcFlatRewards(totalRewards, timeElapsed, programDuration)
                    ).to.be.revertedWithError('panic code 0x1');
                }
            });

            // verify that after half of the program duration has elapsed, we get half of the rewards
            it(`calcFlatRewards(${totalRewards}, ${programDuration / 2}, ${programDuration})`, async () => {
                const actual = await rewardsMath.calcFlatRewards(totalRewards, programDuration / 2, programDuration);
                const expected = BigNumber.from(totalRewards).div(2);
                expect(actual).to.equal(expected);
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
        const ONE = new Decimal(1);
        const TWO = new Decimal(2);

        const calcExpDecayRewards = (totalRewards: BigNumberish, timeElapsed: number, halfLife: number) => {
            it(`calcExpDecayRewards(${totalRewards}, ${timeElapsed}, ${halfLife})`, async () => {
                const f = new Decimal(timeElapsed).div(halfLife);
                if (f.lt(EXP2_INPUT_TOO_HIGH)) {
                    const f = new Decimal(timeElapsed).div(halfLife);
                    const actual = await rewardsMath.calcExpDecayRewards(totalRewards, timeElapsed, halfLife);
                    const expected = new Decimal(totalRewards.toString()).mul(ONE.sub(ONE.div(TWO.pow(f))));
                    await expect(actual).to.almostEqual(expected, {
                        maxAbsoluteError: new Decimal(1),
                        relation: Relation.LesserOrEqual
                    });
                } else {
                    await expect(
                        rewardsMath.calcExpDecayRewards(totalRewards, timeElapsed, halfLife)
                    ).to.revertedWithError('Overflow');
                }
            });

            // verify that after half-life has elapsed, we get (almost) half of the rewards
            it(`calcExpDecayRewards(${totalRewards}, ${halfLife}, ${halfLife})`, async () => {
                const actual = await rewardsMath.calcExpDecayRewards(totalRewards, halfLife, halfLife);
                const expected = new Decimal(totalRewards.toString()).div(TWO);
                await expect(actual).to.almostEqual(expected, {
                    maxAbsoluteError: new Decimal(1),
                    relation: Relation.LesserOrEqual
                });
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
                    years(35),
                    years(36)
                ]) {
                    for (const halfLife of [days(350), days(560)]) {
                        calcExpDecayRewards(totalRewards, timeElapsed, halfLife);
                    }
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
                for (let secondsNum = 0; secondsNum < 5; secondsNum++) {
                    for (let minutesNum = 0; minutesNum < 5; minutesNum++) {
                        for (let hoursNum = 0; hoursNum < 5; hoursNum++) {
                            for (let daysNum = 0; daysNum < 5; daysNum++) {
                                for (let yearsNum = 0; yearsNum < 5; yearsNum++) {
                                    for (const halfLife of [
                                        days(1),
                                        days(30),
                                        years(0.5),
                                        years(1),
                                        years(1.5),
                                        years(2)
                                    ]) {
                                        calcExpDecayRewards(
                                            totalRewards,
                                            seconds(secondsNum) +
                                                minutes(minutesNum) +
                                                hours(hoursNum) +
                                                days(daysNum) +
                                                years(yearsNum),
                                            halfLife
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });
    });
});
