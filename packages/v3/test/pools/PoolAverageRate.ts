import Contracts from '../../components/Contracts';
import { TestPoolAverageRate } from '../../typechain';
import { PPM_RESOLUTION } from '../helpers/Constants';
import { duration } from '../helpers/Time';
import { toString, toWei, Fraction, AverageRate } from '../helpers/Types';
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
            time: BigNumber.from(0)
        };

        it('should update the average rate to the spot rate at the beginning', async () => {
            const currentTime = BigNumber.from(10000);
            const spotRate = { n: BigNumber.from(1), d: BigNumber.from(10) };
            const averageRate = await poolAverageRate.calcAverageRate(spotRate, INITIAL_AVERAGE_RATE, currentTime);

            expect(averageRate.rate).to.equal(spotRate);
            expect(averageRate.time).to.equal(currentTime);
        });

        it('should not update the average rate more than once per-block', async () => {
            const spotRate1 = { n: BigNumber.from(100), d: BigNumber.from(10) };
            const averageRate1 = await poolAverageRate.calcAverageRate(
                spotRate1,
                INITIAL_AVERAGE_RATE,
                BigNumber.from(0)
            );

            const currentTime = BigNumber.from(10000);
            const spotRate2 = { n: BigNumber.from(1000), d: BigNumber.from(10) };
            const averageRate2 = await poolAverageRate.calcAverageRate(spotRate2, averageRate1, currentTime);
            expect(averageRate2.time).to.equal(currentTime);

            const spotRate3 = { n: BigNumber.from(1000), d: BigNumber.from(100) };
            const averageRate3 = await poolAverageRate.calcAverageRate(spotRate3, averageRate2, currentTime);
            expect(averageRate3.rate).to.equal(averageRate2.rate);
            expect(averageRate3.time).to.equal(averageRate2.time);
        });

        it('should update the average rate to the spot rate after the TWA window', async () => {
            let currentTime = BigNumber.from(10000);
            const spotRate1 = { n: BigNumber.from(100), d: BigNumber.from(10) };
            const averageRate1 = await poolAverageRate.calcAverageRate(spotRate1, INITIAL_AVERAGE_RATE, currentTime);

            expect(averageRate1.rate).to.equal(spotRate1);
            expect(averageRate1.time).to.equal(currentTime);

            currentTime = currentTime.add(BigNumber.from(1));
            const newSpotRate = { n: BigNumber.from(1000000000000), d: BigNumber.from(10) };
            const averageRate2 = await poolAverageRate.calcAverageRate(newSpotRate, averageRate1, currentTime);
            expect(averageRate2.rate).not.to.equal(newSpotRate);
            expect(averageRate2.time).to.equal(currentTime);

            currentTime = currentTime.add(AVERAGE_RATE_PERIOD);
            const averageRate3 = await poolAverageRate.calcAverageRate(newSpotRate, averageRate1, currentTime);
            expect(averageRate3.rate).to.equal(newSpotRate);
            expect(averageRate3.time).to.equal(currentTime);
        });

        interface Step {
            incTime: (time: BigNumber) => BigNumber;
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
                    let currentTime = BigNumber.from(10000);
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

                        const timeElapsed = currentTime.sub(prevCurrentTime);
                        const newAverageRate = {
                            n: prevAverageRate.rate.n
                                .mul(spotRate.d)
                                .mul(AVERAGE_RATE_PERIOD.sub(timeElapsed))
                                .add(prevAverageRate.rate.d.mul(spotRate.n).mul(timeElapsed)),
                            d: AVERAGE_RATE_PERIOD.mul(prevAverageRate.rate.d).mul(spotRate.d)
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
                        incTime: (time) => time.add(BigNumber.from(1)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.add(BigNumber.from(1000)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(120)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.add(BigNumber.from(1000)),
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
                    n: toWei(BigNumber.from(1000)),
                    d: BigNumber.from(200000)
                },
                steps: [
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(60)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    }
                ]
            });

            testCalcAverageRate({
                name: 'decreasing rate',
                initSpotRate: {
                    n: toWei(BigNumber.from(1000)),
                    d: BigNumber.from(2)
                },
                steps: [
                    {
                        incTime: (time) => time.add(BigNumber.from(100)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(100)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(100)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(100)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    }
                ]
            });

            testCalcAverageRate({
                name: 'increasing and decreasing rate',
                initSpotRate: {
                    n: toWei(BigNumber.from(1000)),
                    d: BigNumber.from(2)
                },
                steps: [
                    {
                        incTime: (time) => time.add(BigNumber.from(100)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(100)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.mul(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(100)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(BigNumber.from(2)),
                            d: spotRate.d
                        })
                    },
                    {
                        incTime: (time) => time.add(BigNumber.from(100)),
                        nextSpotRate: (spotRate: Fraction<BigNumber>) => ({
                            n: spotRate.n.div(BigNumber.from(2)),
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
            scaleFactors: BigNumber[],
            maxDeviations: BigNumber[]
        ) => {
            for (const initAverageRate of averageRates) {
                for (const averageRateScaleFactor of scaleFactors) {
                    for (const spotRateScaleFactor of scaleFactors) {
                        const averageRateScale = BigNumber.from(10).pow(BigNumber.from(averageRateScaleFactor));
                        const averageRate: AverageRate<BigNumber> = {
                            rate: {
                                n: initAverageRate.n.mul(averageRateScale),
                                d: initAverageRate.d.mul(averageRateScale)
                            },
                            time: BigNumber.from(0)
                        };
                        const spotRateScale = BigNumber.from(10).pow(BigNumber.from(spotRateScaleFactor));
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
                                        const maxDeviation = BigNumber.from(0);

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
                                                    n: baseSpotRate.n.add(BigNumber.from(1)),
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
                                                    d: baseSpotRate.d.add(BigNumber.from(1))
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
                                                    d: baseSpotRate.d.mul(BigNumber.from(2))
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
                                                    n: BigNumber.from(1),
                                                    d: toWei(BigNumber.from(10))
                                                },
                                                averageRate,
                                                maxDeviation
                                            )
                                        ).to.be.false;

                                        expect(
                                            await poolAverageRate.isPoolRateStable(
                                                {
                                                    n: baseSpotRate.n.add(BigNumber.from(1)),
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
                                                        d: baseSpotRate.d.mul(PPM_RESOLUTION.add(maxDeviation))
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
                                                        d: baseSpotRate.d.mul(
                                                            PPM_RESOLUTION.add(maxDeviation.add(BigNumber.from(1)))
                                                        )
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
                                                        d: baseSpotRate.d.mul(PPM_RESOLUTION.sub(maxDeviation))
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
                                                        d: baseSpotRate.d.mul(
                                                            PPM_RESOLUTION.sub(maxDeviation.add(BigNumber.from(1)))
                                                        )
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
            const AVERAGE_RATES = [{ n: BigNumber.from(1), d: BigNumber.from(10000) }];
            const SCALE_FACTORS = [0, 18].map((d) => BigNumber.from(d));
            const MAX_DEVIATIONS = [10_000].map((d) => BigNumber.from(d));

            testVerifyAverageRate(AVERAGE_RATES, SCALE_FACTORS, MAX_DEVIATIONS);
        });

        describe('@stress tests', () => {
            const AVERAGE_RATES = [
                { n: BigNumber.from(1), d: BigNumber.from(1) },
                { n: BigNumber.from(1), d: BigNumber.from(10000) },
                { n: BigNumber.from(10000), d: BigNumber.from(1) }
            ];
            const SCALE_FACTORS = [0, 2, 10, 18].map((d) => BigNumber.from(d));
            const MAX_DEVIATIONS = [10_000, 100_000, 500_000].map((d) => BigNumber.from(d));

            testVerifyAverageRate(AVERAGE_RATES, SCALE_FACTORS, MAX_DEVIATIONS);
        });
    });

    describe('equality', () => {
        for (const [averageRate1, averageRate2] of [
            [
                { rate: { n: BigNumber.from(123), d: BigNumber.from(11) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(123), d: BigNumber.from(11) }, time: BigNumber.from(1) }
            ],
            [
                { rate: { n: BigNumber.from(123), d: BigNumber.from(11) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(123), d: BigNumber.from(11) }, time: BigNumber.from(12345) }
            ],
            [
                { rate: { n: BigNumber.from(2000), d: BigNumber.from(1000) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(2), d: BigNumber.from(1) }, time: BigNumber.from(12345) }
            ],
            [
                { rate: { n: BigNumber.from(1), d: BigNumber.from(5) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(2), d: BigNumber.from(10) }, time: BigNumber.from(12345) }
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
                { rate: { n: BigNumber.from(123), d: BigNumber.from(11) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(123), d: BigNumber.from(1) }, time: BigNumber.from(1) }
            ],
            [
                { rate: { n: BigNumber.from(123), d: BigNumber.from(11) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(123), d: BigNumber.from(1) }, time: BigNumber.from(12345) }
            ],
            [
                { rate: { n: BigNumber.from(2000), d: BigNumber.from(1000) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(2), d: BigNumber.from(2) }, time: BigNumber.from(12345) }
            ],
            [
                { rate: { n: BigNumber.from(2000), d: BigNumber.from(1000) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(2000), d: BigNumber.from(1001) }, time: BigNumber.from(12345) }
            ],
            [
                { rate: { n: BigNumber.from(1), d: BigNumber.from(5) }, time: BigNumber.from(1) },
                { rate: { n: BigNumber.from(2), d: BigNumber.from(11) }, time: BigNumber.from(12345) }
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
