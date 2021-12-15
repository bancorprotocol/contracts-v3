import Contracts from '../../components/Contracts';
import { TestPoolAverageRate } from '../../typechain-types';
import { PPM_RESOLUTION, MAX_UINT256 } from '../helpers/Constants';
import { duration } from '../helpers/Time';
import { toString, toWei, toPPM, Fraction, AverageRate } from '../helpers/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

describe('PoolAverageRate', () => {
    let poolAverageRate: TestPoolAverageRate;

    before(async () => {
        poolAverageRate = await Contracts.TestPoolAverageRate.deploy();
    });

    describe('calculate average rate', () => {
        const AVERAGE_RATE_PERIOD = duration.minutes(10);
        const INITIAL_AVERAGE_RATE: AverageRate<BigNumber> = {
            rate: {
                n: BigNumber.from(0),
                d: BigNumber.from(0)
            },
            time: 0
        };

        it('should update the average rate to the spot rate at the beginning', async () => {
            const currentTime = 10_000;
            const spotRate = { n: 1, d: 10 };
            const averageRate = await poolAverageRate.calcAverageRate(spotRate, INITIAL_AVERAGE_RATE, currentTime);

            expect(averageRate.rate).to.equal(spotRate);
            expect(averageRate.time).to.equal(currentTime);
        });

        it('should not update the average rate more than once per-block', async () => {
            const spotRate1 = { n: 100, d: 10 };
            const averageRate1 = await poolAverageRate.calcAverageRate(spotRate1, INITIAL_AVERAGE_RATE, 0);

            const currentTime = 10_000;
            const spotRate2 = { n: 1000, d: 10 };
            const averageRate2 = await poolAverageRate.calcAverageRate(spotRate2, averageRate1, currentTime);
            expect(averageRate2.time).to.equal(currentTime);

            const spotRate3 = { n: 1000, d: 100 };
            const averageRate3 = await poolAverageRate.calcAverageRate(spotRate3, averageRate2, currentTime);
            expect(averageRate3.rate).to.equal(averageRate2.rate);
            expect(averageRate3.time).to.equal(averageRate2.time);
        });

        it('should update the average rate to the spot rate after the TWA window', async () => {
            let currentTime = 10_000;
            const spotRate1 = { n: 100, d: 10 };
            const averageRate1 = await poolAverageRate.calcAverageRate(spotRate1, INITIAL_AVERAGE_RATE, currentTime);

            expect(averageRate1.rate).to.equal(spotRate1);
            expect(averageRate1.time).to.equal(currentTime);

            currentTime += 1;
            const newSpotRate = { n: 1_000_000_000_000, d: 10 };
            const averageRate2 = await poolAverageRate.calcAverageRate(newSpotRate, averageRate1, currentTime);
            expect(averageRate2.rate).not.to.equal(newSpotRate);
            expect(averageRate2.time).to.equal(currentTime);

            currentTime = currentTime + AVERAGE_RATE_PERIOD;
            const averageRate3 = await poolAverageRate.calcAverageRate(newSpotRate, averageRate1, currentTime);
            expect(averageRate3.rate).to.equal(newSpotRate);
            expect(averageRate3.time).to.equal(currentTime);
        });

        interface Step {
            incTime: (time: number) => number;
            nextSpotRate: (spotRate: Fraction<BigNumber>) => Fraction<BigNumber>;
        }

        interface Scenario {
            name: string;
            initSpotRate: Fraction<BigNumber>;
            steps: Step[];
        }

        const testCalcAverageRate = async (scenario: Scenario) => {
            const { name, initSpotRate } = scenario;

            context(`${name}`, () => {
                it('should update the average rate', async () => {
                    let currentTime = 10_000;
                    let spotRate = initSpotRate;
                    let averageRate = await poolAverageRate.calcAverageRate(
                        spotRate,
                        INITIAL_AVERAGE_RATE,
                        currentTime
                    );

                    for (const step of scenario.steps) {
                        const prevCurrentTime = currentTime;
                        const prevAverageRate = averageRate;

                        currentTime = step.incTime(currentTime);
                        spotRate = step.nextSpotRate(spotRate);

                        const timeElapsed = currentTime - prevCurrentTime;
                        const newAverageRate = {
                            n: prevAverageRate.rate.n
                                .mul(spotRate.d)
                                .mul(AVERAGE_RATE_PERIOD - timeElapsed)
                                .add(prevAverageRate.rate.d.mul(spotRate.n).mul(timeElapsed)),
                            d: BigNumber.from(AVERAGE_RATE_PERIOD).mul(prevAverageRate.rate.d).mul(spotRate.d)
                        };

                        averageRate = await poolAverageRate.calcAverageRate(spotRate, prevAverageRate, currentTime);

                        expect(averageRate.rate).to.almostEqual(newAverageRate, {
                            maxRelativeError: new Decimal(0.0000000000000001)
                        });
                        expect(averageRate.time).to.equal(currentTime);
                    }
                });
            });
        };

        describe('quick tests', () => {
            testCalcAverageRate({
                name: 'basic scenario',
                initSpotRate: { n: BigNumber.from(1), d: BigNumber.from(2) },
                steps: [
                    {
                        incTime: (time) => time + 1,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.add(1000),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 120,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.add(1000),
                            d: spotRate.d
                        })
                    }
                ]
            });
        });

        describe('@stress tests', () => {
            testCalcAverageRate({
                name: 'multiple updates',
                initSpotRate: {
                    n: toWei(1000),
                    d: BigNumber.from(200_000)
                },
                steps: [
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 60,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    }
                ]
            });

            testCalcAverageRate({
                name: 'decreasing rate',
                initSpotRate: {
                    n: toWei(1000),
                    d: BigNumber.from(2)
                },
                steps: [
                    {
                        incTime: (time) => time + 100,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 100,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 100,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 100,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(2),
                            d: spotRate.d
                        })
                    }
                ]
            });

            testCalcAverageRate({
                name: 'increasing and decreasing rate',
                initSpotRate: {
                    n: toWei(1000),
                    d: BigNumber.from(2)
                },
                steps: [
                    {
                        incTime: (time) => time + 100,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 100,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 100,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(2),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time + 100,
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(2),
                            d: spotRate.d
                        })
                    }
                ]
            });
        });
    });

    describe('verify average rate', () => {
        const testVerifyAverageRate = async (
            averageRates: Fraction<BigNumber>[],
            scaleFactors: number[],
            maxDeviations: number[]
        ) => {
            for (const initAverageRate of averageRates) {
                for (const averageRateScaleFactor of scaleFactors) {
                    for (const spotRateScaleFactor of scaleFactors) {
                        const averageRateScale = BigNumber.from(10).pow(averageRateScaleFactor);
                        const averageRate: AverageRate<BigNumber> = {
                            rate: {
                                n: initAverageRate.n.mul(averageRateScale),
                                d: initAverageRate.d.mul(averageRateScale)
                            },
                            time: 0
                        };
                        const spotRateScale = BigNumber.from(10).pow(spotRateScaleFactor);
                        const baseSpotRate = {
                            n: initAverageRate.n.mul(spotRateScale),
                            d: initAverageRate.d.mul(spotRateScale)
                        };

                        context(
                            `average rate = ${toString(
                                initAverageRate
                            )}, average rate scale = ${averageRateScale.toString()}, spot rate scale = ${spotRateScale.toString()}`,
                            async () => {
                                context('no deviation is permitted', () => {
                                    it('should not allow any deviation', async () => {
                                        const maxDeviation = 0;

                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                baseSpotRate,
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.true;

                                        // a small deviation (average < spot)
                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                {
                                                    n: baseSpotRate.n.add(1),
                                                    d: baseSpotRate.d
                                                },
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.false;

                                        // a small deviation (average > spot)
                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                {
                                                    n: baseSpotRate.n,
                                                    d: baseSpotRate.d.add(1)
                                                },
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.false;
                                    });
                                });

                                context('max deviation is permitted', () => {
                                    it('should allow up to 100% deviation', async () => {
                                        const maxDeviation = PPM_RESOLUTION;

                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                baseSpotRate,
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.true;

                                        // 200% deviation (average > spot)
                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                {
                                                    n: baseSpotRate.n,
                                                    d: baseSpotRate.d.mul(2)
                                                },
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.true;

                                        // 300% deviation (average > spot)
                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                {
                                                    n: baseSpotRate.n,
                                                    d: baseSpotRate.d.mul(BigNumber.from(3))
                                                },
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.false;

                                        // a huge deviation (average > spot)
                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                {
                                                    n: 1,
                                                    d: toWei(10)
                                                },
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.false;

                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                {
                                                    n: baseSpotRate.n.add(1),
                                                    d: baseSpotRate.d
                                                },
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.true;
                                    });
                                });

                                for (const maxDeviation of maxDeviations) {
                                    context(`max deviation = ${maxDeviation.toString()}`, () => {
                                        it('should properly verify the average rate', async () => {
                                            expect(
                                                await poolAverageRate.isPoolRateStable(
                                                    baseSpotRate,
                                                    averageRate,
                                                    maxDeviation
                                                )
                                            ).to.be.true;

                                            // at the max deviation (average > spot)
                                            expect(
                                                await poolAverageRate.isPoolRateStable(
                                                    {
                                                        n: baseSpotRate.n.mul(PPM_RESOLUTION),
                                                        d: baseSpotRate.d.mul(PPM_RESOLUTION + maxDeviation)
                                                    },
                                                    averageRate,
                                                    maxDeviation
                                                )
                                            ).to.be.true;

                                            // above the max deviation (average > spot)
                                            expect(
                                                await poolAverageRate.isPoolRateStable(
                                                    {
                                                        n: baseSpotRate.n.mul(PPM_RESOLUTION),
                                                        d: baseSpotRate.d.mul(PPM_RESOLUTION + maxDeviation + 1)
                                                    },
                                                    averageRate,
                                                    maxDeviation
                                                )
                                            ).to.be.false;

                                            // at the max deviation (average < spot)
                                            expect(
                                                await poolAverageRate.isPoolRateStable(
                                                    {
                                                        n: baseSpotRate.n.mul(PPM_RESOLUTION),
                                                        d: baseSpotRate.d.mul(PPM_RESOLUTION - maxDeviation)
                                                    },
                                                    averageRate,
                                                    maxDeviation
                                                )
                                            ).to.be.true;

                                            // above the max deviation (average < spot)
                                            expect(
                                                await poolAverageRate.isPoolRateStable(
                                                    {
                                                        n: baseSpotRate.n.mul(PPM_RESOLUTION),
                                                        d: baseSpotRate.d.mul(PPM_RESOLUTION - (maxDeviation + 1))
                                                    },
                                                    averageRate,
                                                    maxDeviation
                                                )
                                            ).to.be.false;
                                        });
                                    });
                                }
                            }
                        );
                    }
                }
            }
        };

        describe('quick tests', () => {
            const AVERAGE_RATES = [{ n: BigNumber.from(1), d: BigNumber.from(10_000) }];
            const SCALE_FACTORS = [0, 18];
            const MAX_DEVIATIONS = [1].map((d) => toPPM(d));

            testVerifyAverageRate(AVERAGE_RATES, SCALE_FACTORS, MAX_DEVIATIONS);
        });

        describe('@stress tests', () => {
            const AVERAGE_RATES = [
                { n: BigNumber.from(1), d: BigNumber.from(1) },
                { n: BigNumber.from(1), d: BigNumber.from(10_000) },
                { n: BigNumber.from(10_000), d: BigNumber.from(1) }
            ];
            const SCALE_FACTORS = [0, 2, 10, 18];
            const MAX_DEVIATIONS = [1, 10, 50];

            testVerifyAverageRate(AVERAGE_RATES, SCALE_FACTORS, MAX_DEVIATIONS);
        });
    });

    describe('reduced ratio', () => {
        const THRESHOLD = BigNumber.from(2).pow(112).sub(1);

        const reducedRatioTest = (ratio: Fraction<BigNumber>, maxRelativeError: Decimal) => {
            it(`ratio = ${toString(ratio)}`, async () => {
                const newRatio = await poolAverageRate.reducedRatio(ratio);
                expect(newRatio[0]).to.be.lte(THRESHOLD);
                expect(newRatio[1]).to.be.lte(THRESHOLD);
                expect(ratio).to.almostEqual({ n: newRatio[0], d: newRatio[1] }, { maxRelativeError });
            });
        };

        for (let n = 0; n < 10; n++) {
            for (let d = 0; d < 10; d++) {
                reducedRatioTest({ n: THRESHOLD.sub(n), d: THRESHOLD.sub(d) }, new Decimal('0'));
                reducedRatioTest(
                    { n: THRESHOLD.sub(n), d: THRESHOLD.add(d) },
                    new Decimal('0.0000000000000000000000000000000002')
                );
                reducedRatioTest(
                    { n: THRESHOLD.add(n), d: THRESHOLD.sub(d) },
                    new Decimal('0.0000000000000000000000000000000002')
                );
                reducedRatioTest(
                    { n: THRESHOLD.add(n), d: THRESHOLD.add(d) },
                    new Decimal('0.0000000000000000000000000000000002')
                );
            }
        }

        for (let i = BigNumber.from(1); i.lte(THRESHOLD); i = i.mul(10)) {
            for (let j = BigNumber.from(1); j.lte(THRESHOLD); j = j.mul(10)) {
                const n = MAX_UINT256.div(THRESHOLD).mul(i).add(1);
                const d = MAX_UINT256.div(THRESHOLD).mul(j).add(1);
                reducedRatioTest({ n, d }, new Decimal('0.04'));
            }
        }

        for (let i = 96; i <= 256; i += 16) {
            for (let j = i - 64; j <= i + 64; j += 16) {
                const iMax = BigNumber.from(2).pow(i).sub(1);
                const jMax = BigNumber.from(2).pow(j).sub(1);
                for (const n of [
                    iMax.div(3),
                    iMax.div(2),
                    iMax.mul(2).div(3),
                    iMax.mul(3).div(4),
                    iMax.sub(1),
                    iMax,
                    iMax.add(1),
                    iMax.mul(4).div(3),
                    iMax.mul(3).div(2),
                    iMax.mul(2),
                    iMax.mul(3)
                ]) {
                    for (const d of [jMax.sub(1), jMax, jMax.add(1)]) {
                        if (n.lte(MAX_UINT256) && d.lte(MAX_UINT256)) {
                            reducedRatioTest({ n, d }, new Decimal('0.000000000000008'));
                        }
                    }
                }
            }
        }
    });

    describe('equality', () => {
        for (const [averageRate1, averageRate2] of [
            [
                { rate: { n: 123, d: 11 }, time: 1 },
                { rate: { n: 123, d: 11 }, time: 1 }
            ],
            [
                { rate: { n: 123, d: 11 }, time: 1 },
                { rate: { n: 123, d: 11 }, time: 12_345 }
            ],
            [
                { rate: { n: 2000, d: 1000 }, time: 1 },
                { rate: { n: 2, d: 1 }, time: 12_345 }
            ],
            [
                { rate: { n: 1, d: 5 }, time: 1 },
                { rate: { n: 2, d: 10 }, time: 12_345 }
            ]
        ]) {
            it(`should return that ${toString(averageRate1.rate)} and ${toString(
                averageRate2.rate
            )} are equal`, async () => {
                expect(await poolAverageRate.isEqual(averageRate1, averageRate2)).to.be.true;
            });
        }

        for (const [averageRate1, averageRate2] of [
            [
                { rate: { n: 123, d: 11 }, time: 1 },
                { rate: { n: 123, d: 1 }, time: 1 }
            ],
            [
                { rate: { n: 123, d: 11 }, time: 1 },
                { rate: { n: 123, d: 1 }, time: 12_345 }
            ],
            [
                { rate: { n: 2000, d: 1000 }, time: 1 },
                { rate: { n: 2, d: 2 }, time: 12_345 }
            ],
            [
                { rate: { n: 2000, d: 1000 }, time: 1 },
                { rate: { n: 2000, d: 1001 }, time: 12_345 }
            ],
            [
                { rate: { n: 1, d: 5 }, time: 1 },
                { rate: { n: 2, d: 11 }, time: 12_345 }
            ]
        ]) {
            it(`should return that ${toString(averageRate1.rate)} and ${toString(
                averageRate2.rate
            )} are not equal`, async () => {
                expect(await poolAverageRate.isEqual(averageRate1, averageRate2)).to.be.false;
            });
        }
    });
});
