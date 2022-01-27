import Contracts, { TestPoolAverageRate } from '../../components/Contracts';
import { PPT_RESOLUTION, PPM_RESOLUTION } from '../../utils/Constants';
import { toPPT, toPPM, Fraction } from '../../utils/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

const MAX_UINT32 = BigNumber.from(2).pow(32).sub(1);
const MAX_UINT64 = BigNumber.from(2).pow(64).sub(1);
const MAX_UINT96 = BigNumber.from(2).pow(96).sub(1);
const MAX_UINT112 = BigNumber.from(2).pow(112).sub(1);
const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);

describe('PoolAverageRate', () => {
    let poolAverageRate: TestPoolAverageRate;

    const calcAverageRateTest = (averageRate: Fraction<BigNumber>, spotRate: Fraction<BigNumber>, weight: number) => {
        it(`average rate = ${averageRate}, spot rate = ${spotRate}, weight = ${weight}%`, async () => {
            const weightPPT = toPPT(weight);
            const expected = {
                n: averageRate.n
                    .mul(spotRate.d)
                    .mul(weightPPT)
                    .add(averageRate.d.mul(spotRate.n).mul(PPT_RESOLUTION - weightPPT)),
                d: averageRate.d.mul(spotRate.d).mul(PPT_RESOLUTION)
            };
            const actual = await poolAverageRate.calcAverageRate(averageRate, spotRate, weightPPT);
            if (expected.n.lte(MAX_UINT112) && expected.d.lte(MAX_UINT112)) {
                expect(actual).to.equal(expected);
            } else {
                expect(actual).to.almostEqual(expected, { maxRelativeError: new Decimal('0.000016') });
            }
        });
    };

    const isSpotRateStableTest = async (
        spotRate: Fraction<BigNumber>,
        averageRate: Fraction<BigNumber>,
        maxDeviation: number
    ) => {
        it(`spot rate = ${spotRate}, average rate = ${averageRate}, max deviation = ${maxDeviation}%`, async () => {
            const maxDeviationPPM = toPPM(maxDeviation);
            const x = spotRate.n.mul(averageRate.d);
            const y = spotRate.d.mul(averageRate.n);
            const min = x.mul(PPM_RESOLUTION - maxDeviationPPM);
            const mid = y.mul(PPM_RESOLUTION);
            const max = x.mul(PPM_RESOLUTION + maxDeviationPPM);
            const expected = min.lte(mid) && mid.lte(max);
            const actual = await poolAverageRate.isSpotRateStable(spotRate, averageRate, maxDeviationPPM);
            expect(actual).to.equal(expected);
        });
    };

    before(async () => {
        poolAverageRate = await Contracts.TestPoolAverageRate.deploy();
    });

    describe('quick tests', () => {
        describe('calcAverageRate', () => {
            for (const n of [MAX_UINT64, MAX_UINT96]) {
                for (const d of [MAX_UINT64, MAX_UINT96]) {
                    const averageRate = { n, d };
                    for (const n of [MAX_UINT64, MAX_UINT96]) {
                        for (const d of [MAX_UINT64, MAX_UINT96]) {
                            const spotRate = { n, d };
                            for (const weight of [20, 80]) {
                                calcAverageRateTest(averageRate, spotRate, weight);
                            }
                        }
                    }
                }
            }
        });

        describe('isSpotRateStableTest', () => {
            for (const n of [MAX_UINT64, MAX_UINT96]) {
                for (const d of [MAX_UINT64, MAX_UINT96]) {
                    const spotRate = { n, d };
                    for (const n of [MAX_UINT64, MAX_UINT96]) {
                        for (const d of [MAX_UINT64, MAX_UINT96]) {
                            const averageRate = { n, d };
                            for (const maxDeviation of [2, 5]) {
                                isSpotRateStableTest(spotRate, averageRate, maxDeviation);
                            }
                        }
                    }
                }
            }
        });
    });

    describe('@stress tests', () => {
        describe('calcAverageRate', () => {
            for (const n of [0, 1, 2, 3]) {
                for (const d of [1, 2, 3, 4]) {
                    const averageRate = { n: BigNumber.from(n), d: BigNumber.from(d) };
                    for (const n of [0, 1, 2, 3]) {
                        for (const d of [1, 2, 3, 4]) {
                            const spotRate = { n: BigNumber.from(n), d: BigNumber.from(d) };
                            for (const weight of [0, 20, 80, 100]) {
                                calcAverageRateTest(averageRate, spotRate, weight);
                            }
                        }
                    }
                }
            }

            for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                    const averageRate = { n, d };
                    for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                        for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                            const spotRate = { n, d };
                            for (const weight of [0, 20, 80, 100]) {
                                calcAverageRateTest(averageRate, spotRate, weight);
                            }
                        }
                    }
                }
            }
        });

        describe('isSpotRateStableTest', () => {
            for (const n of [0, 1, 2, 3]) {
                for (const d of [1, 2, 3, 4]) {
                    const spotRate = { n: BigNumber.from(n), d: BigNumber.from(d) };
                    for (const n of [0, 1, 2, 3]) {
                        for (const d of [1, 2, 3, 4]) {
                            const averageRate = { n: BigNumber.from(n), d: BigNumber.from(d) };
                            for (const maxDeviation of [0, 2, 5, 10]) {
                                isSpotRateStableTest(spotRate, averageRate, maxDeviation);
                            }
                        }
                    }
                }
            }

            for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                    const spotRate = { n, d };
                    for (const n of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                        for (const d of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                            const averageRate = { n, d };
                            for (const maxDeviation of [0, 2, 5, 10]) {
                                isSpotRateStableTest(spotRate, averageRate, maxDeviation);
                            }
                        }
                    }
                }
            }
        });
    });
});
