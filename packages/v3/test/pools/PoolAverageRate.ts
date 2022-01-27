import Contracts, { TestPoolAverageRate } from '../../components/Contracts';
import { PPT_RESOLUTION, PPM_RESOLUTION } from '../../utils/Constants';
import { toPPT, toPPM } from '../../utils/Types';
import { expect } from 'chai';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';

const MAX_UINT32 = BigNumber.from(2).pow(32).sub(1);
const MAX_UINT64 = BigNumber.from(2).pow(64).sub(1);
const MAX_UINT96 = BigNumber.from(2).pow(96).sub(1);
const MAX_UINT112 = BigNumber.from(2).pow(112).sub(1);
const MAX_UINT128 = BigNumber.from(2).pow(128).sub(1);

describe('PoolAverageRate', () => {
    let poolAverageRate: TestPoolAverageRate;

    const calcAverageRateTest = (an: BigNumberish, ad: BigNumberish, sn: BigNumberish, sd: BigNumberish, w: number) => {
        it(`average rate = ${an}/${ad}, spot rate = ${sn}/${sd}, weight = ${w}%`, async () => {
            const averageRate = { n: BigNumber.from(an), d: BigNumber.from(ad) };
            const spotRate = { n: BigNumber.from(sn), d: BigNumber.from(sd) };
            const weightPPT = toPPT(w);
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
        sn: BigNumberish,
        sd: BigNumberish,
        an: BigNumberish,
        ad: BigNumberish,
        md: number
    ) => {
        it(`spot rate = ${sn}/${sd}, average rate = ${an}/${ad}, max deviation = ${md}%`, async () => {
            const spotRate = { n: BigNumber.from(sn), d: BigNumber.from(sd) };
            const averageRate = { n: BigNumber.from(an), d: BigNumber.from(ad) };
            const maxDeviationPPM = toPPM(md);
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
            for (const an of [MAX_UINT64, MAX_UINT96]) {
                for (const ad of [MAX_UINT64, MAX_UINT96]) {
                    for (const sn of [MAX_UINT64, MAX_UINT96]) {
                        for (const sd of [MAX_UINT64, MAX_UINT96]) {
                            for (const w of [20, 80]) {
                                calcAverageRateTest(an, ad, sn, sd, w);
                            }
                        }
                    }
                }
            }
        });

        describe('isSpotRateStableTest', () => {
            for (const sn of [MAX_UINT64, MAX_UINT96]) {
                for (const sd of [MAX_UINT64, MAX_UINT96]) {
                    for (const an of [MAX_UINT64, MAX_UINT96]) {
                        for (const ad of [MAX_UINT64, MAX_UINT96]) {
                            for (const md of [2, 5]) {
                                isSpotRateStableTest(sn, sd, an, ad, md);
                            }
                        }
                    }
                }
            }
        });
    });

    describe('@stress tests', () => {
        describe('calcAverageRate', () => {
            for (const an of [0, 1, 2, 3]) {
                for (const ad of [1, 2, 3, 4]) {
                    for (const sn of [0, 1, 2, 3]) {
                        for (const sd of [1, 2, 3, 4]) {
                            for (const w of [0, 20, 80, 100]) {
                                calcAverageRateTest(an, ad, sn, sd, w);
                            }
                        }
                    }
                }
            }

            for (const an of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                for (const ad of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                    for (const sn of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                        for (const sd of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                            for (const w of [0, 20, 80, 100]) {
                                calcAverageRateTest(an, ad, sn, sd, w);
                            }
                        }
                    }
                }
            }
        });

        describe('isSpotRateStableTest', () => {
            for (const sn of [0, 1, 2, 3]) {
                for (const sd of [1, 2, 3, 4]) {
                    for (const an of [0, 1, 2, 3]) {
                        for (const ad of [1, 2, 3, 4]) {
                            for (const md of [0, 2, 5, 10]) {
                                isSpotRateStableTest(sn, sd, an, ad, md);
                            }
                        }
                    }
                }
            }

            for (const sn of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                for (const sd of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                    for (const an of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                        for (const ad of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                            for (const md of [0, 2, 5, 10]) {
                                isSpotRateStableTest(sn, sd, an, ad, md);
                            }
                        }
                    }
                }
            }
        });
    });
});
