import Contracts from '../../components/Contracts';
import { TestPoolAverageRate } from '../../typechain-types';
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
        an: BigNumberish,
        ad: BigNumberish,
        sn: BigNumberish,
        sd: BigNumberish,
        md: number
    ) => {
        it(`average rate = ${an}/${ad}, spot rate = ${sn}/${sd}, max deviation = ${md}%`, async () => {
            const averageRate = { n: BigNumber.from(an), d: BigNumber.from(ad) };
            const spotRate = { n: BigNumber.from(sn), d: BigNumber.from(sd) };
            const maxDeviationPPM = toPPM(md);
            const x = averageRate.d.mul(spotRate.n);
            const y = averageRate.n.mul(spotRate.d);
            const min = x.mul(PPM_RESOLUTION - maxDeviationPPM);
            const mid = y.mul(PPM_RESOLUTION);
            const max = x.mul(PPM_RESOLUTION + maxDeviationPPM);
            const expected = min.lte(mid) && mid.lte(max);
            const actual = await poolAverageRate.isSpotRateStable(averageRate, spotRate, maxDeviationPPM);
            expect(actual).to.equal(expected);
        });
    };

    const isValidTest = (n: BigNumberish, d: BigNumberish) => {
        it(`average rate = ${n}/${d}`, async () => {
            const ar = { n: BigNumber.from(n), d: BigNumber.from(d) };
            const expected = ar.d.gt(0);
            const actual = await poolAverageRate.isValid(ar);
            expect(actual).to.equal(expected);
        });
    };

    const areEqualTest = (n1: BigNumberish, d1: BigNumberish, n2: BigNumberish, d2: BigNumberish) => {
        it(`average rate 1 = ${n1}/${d1}, average rate 2 = ${n2}/${d2}`, async () => {
            const ar1 = { n: BigNumber.from(n1), d: BigNumber.from(d1) };
            const ar2 = { n: BigNumber.from(n2), d: BigNumber.from(d2) };
            const expected =
                (ar1.d.eq(0) && ar2.d.eq(0)) || (ar1.d.gt(0) && ar2.d.gt(0) && ar1.n.mul(ar2.d).eq(ar2.n.mul(ar1.d)));
            const actual = await poolAverageRate.areEqual(ar1, ar2);
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
            for (const an of [MAX_UINT64, MAX_UINT96]) {
                for (const ad of [MAX_UINT64, MAX_UINT96]) {
                    for (const sn of [MAX_UINT64, MAX_UINT96]) {
                        for (const sd of [MAX_UINT64, MAX_UINT96]) {
                            for (const md of [2, 5]) {
                                isSpotRateStableTest(an, ad, sn, sd, md);
                            }
                        }
                    }
                }
            }
        });

        describe('isValid', () => {
            for (const n of [0, 1]) {
                for (const d of [0, 1]) {
                    isValidTest(n, d);
                }
            }
        });

        describe('areEqual', () => {
            for (const n1 of [0, 1, 2, 3, 4]) {
                for (const d1 of [0, 1, 2, 3, 4]) {
                    for (const n2 of [0, 1, 2, 3, 4]) {
                        for (const d2 of [0, 1, 2, 3, 4]) {
                            areEqualTest(n1, d1, n2, d2);
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
            for (const an of [0, 1, 2, 3]) {
                for (const ad of [1, 2, 3, 4]) {
                    for (const sn of [0, 1, 2, 3]) {
                        for (const sd of [1, 2, 3, 4]) {
                            for (const md of [0, 2, 5, 10]) {
                                isSpotRateStableTest(an, ad, sn, sd, md);
                            }
                        }
                    }
                }
            }

            for (const an of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                for (const ad of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                    for (const sn of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                        for (const sd of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                            for (const md of [0, 2, 5, 10]) {
                                isSpotRateStableTest(an, ad, sn, sd, md);
                            }
                        }
                    }
                }
            }
        });

        describe('isValid', () => {
            for (const n of [0, 1, 2, 3, MAX_UINT112]) {
                for (const d of [0, 1, 2, 3, MAX_UINT112]) {
                    isValidTest(n, d);
                }
            }
        });

        describe('areEqual', () => {
            for (const n1 of [0, 1, 2, 3, 4, MAX_UINT112]) {
                for (const d1 of [0, 1, 2, 3, 4, MAX_UINT112]) {
                    for (const n2 of [0, 1, 2, 3, 4, MAX_UINT112]) {
                        for (const d2 of [0, 1, 2, 3, 4, MAX_UINT112]) {
                            areEqualTest(n1, d1, n2, d2);
                        }
                    }
                }
            }
        });
    });
});
