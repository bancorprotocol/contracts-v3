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

    const calcAverageRateTest = (
        an: BigNumberish,
        ad: BigNumberish,
        sn: BigNumberish,
        sd: BigNumberish,
        at: number,
        ct: number,
        w: number
    ) => {
        it(`average rate = ${an}/${ad}, spot rate = ${sn}/${sd}, average rate time = ${at}, current time = ${ct}, weight = ${w}%`, async () => {
            const averageRate = { rate: { n: BigNumber.from(an), d: BigNumber.from(ad) }, time: at };
            const spotRate = { n: BigNumber.from(sn), d: BigNumber.from(sd) };
            const currentTime = ct;
            const weightPPT = toPPT(w);
            const newAverageRate = await poolAverageRate.calcAverageRate(averageRate, spotRate, currentTime, weightPPT);
            expect(newAverageRate.time).to.equal(currentTime);
            if (averageRate.time == currentTime) {
                expect(newAverageRate.rate).to.equal(averageRate.rate);
            } else {
                const expectedRate = {
                    n: averageRate.rate.n
                        .mul(spotRate.d)
                        .mul(weightPPT)
                        .add(averageRate.rate.d.mul(spotRate.n).mul(PPT_RESOLUTION - weightPPT)),
                    d: averageRate.rate.d.mul(spotRate.d).mul(PPT_RESOLUTION)
                };
                if (expectedRate.n.lte(MAX_UINT112) && expectedRate.d.lte(MAX_UINT112)) {
                    expect(newAverageRate.rate).to.equal(expectedRate);
                } else {
                    expect(newAverageRate.rate).to.almostEqual(expectedRate, {
                        maxRelativeError: new Decimal('0.000016')
                    });
                }
            }
        });
    };

    const isSpotRateStableTest = async (
        an: BigNumberish,
        ad: BigNumberish,
        sn: BigNumberish,
        sd: BigNumberish,
        md: number,
        at: number,
        ct: number,
        w: number
    ) => {
        it(`average rate = ${an}/${ad}, spot rate = ${sn}/${sd}, max deviation = ${md}%, average rate time = ${at}, current time = ${ct}, weight = ${w}%`, async () => {
            const averageRate = { rate: { n: BigNumber.from(an), d: BigNumber.from(ad) }, time: at };
            const spotRate = { n: BigNumber.from(sn), d: BigNumber.from(sd) };
            const maxDeviationPPM = toPPM(md);
            const currentTime = ct;
            const weightPPT = toPPT(w);
            const newAverageRate = await poolAverageRate.calcAverageRate(averageRate, spotRate, currentTime, weightPPT);
            const x = newAverageRate.rate.d.mul(spotRate.n);
            const y = newAverageRate.rate.n.mul(spotRate.d);
            const min = x.mul(PPM_RESOLUTION - maxDeviationPPM);
            const mid = y.mul(PPM_RESOLUTION);
            const max = x.mul(PPM_RESOLUTION + maxDeviationPPM);
            const expected = min.lte(mid) && mid.lte(max);
            const actual = await poolAverageRate.isSpotRateStable(
                averageRate,
                spotRate,
                maxDeviationPPM,
                currentTime,
                weightPPT
            );
            expect(actual).to.equal(expected);
        });
    };

    const isValidTest = (n: BigNumberish, d: BigNumberish, t: BigNumberish) => {
        it(`average rate = [${n}/${d}, ${t}]`, async () => {
            const ar = { rate: { n: BigNumber.from(n), d: BigNumber.from(d) }, time: t };
            const expected = ar.time != 0 && !ar.rate.d.eq(0);
            const actual = await poolAverageRate.isValid(ar);
            expect(actual).to.equal(expected);
        });
    };

    const areEqualTest = (
        n1: BigNumberish,
        d1: BigNumberish,
        t1: BigNumberish,
        n2: BigNumberish,
        d2: BigNumberish,
        t2: BigNumberish
    ) => {
        it(`average rate 1 = [${n1}/${d1}, ${t1}], average rate 2 = [${n2}/${d2}, ${t2}]`, async () => {
            const ar1 = { rate: { n: BigNumber.from(n1), d: BigNumber.from(d1) }, time: t1 };
            const ar2 = { rate: { n: BigNumber.from(n2), d: BigNumber.from(d2) }, time: t2 };
            const expected =
                ar1.time == ar2.time &&
                ((ar1.rate.d.eq(0) && ar2.rate.d.eq(0)) ||
                    (!ar1.rate.d.eq(0) &&
                        !ar2.rate.d.eq(0) &&
                        ar1.rate.n.mul(ar2.rate.d).eq(ar2.rate.n.mul(ar1.rate.d))));
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
                            for (const at of [1, 2]) {
                                for (const ct of [1, 2]) {
                                    for (const w of [20, 80]) {
                                        calcAverageRateTest(an, ad, sn, sd, at, ct, w);
                                    }
                                }
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
                                for (const at of [1, 2]) {
                                    for (const ct of [1, 2]) {
                                        for (const w of [20, 80]) {
                                            isSpotRateStableTest(an, ad, sn, sd, md, at, ct, w);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        describe('isValid', () => {
            for (const n of [0, 1]) {
                for (const d of [0, 1]) {
                    for (const t of [0, 1]) {
                        isValidTest(n, d, t);
                    }
                }
            }
        });

        describe('areEqual', () => {
            for (const n1 of [0, 1, 2, 3, 4]) {
                for (const d1 of [0, 1, 2, 3, 4]) {
                    for (const t1 of [0, 1]) {
                        for (const n2 of [0, 1, 2, 3, 4]) {
                            for (const d2 of [0, 1, 2, 3, 4]) {
                                for (const t2 of [0, 1]) {
                                    areEqualTest(n1, d1, t1, n2, d2, t2);
                                }
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
                            for (const at of [0, 1, 2, 3]) {
                                for (const ct of [0, 1, 2, 3]) {
                                    for (const w of [0, 20, 80, 100]) {
                                        calcAverageRateTest(an, ad, sn, sd, at, ct, w);
                                    }
                                }
                            }
                        }
                    }
                }
            }

            for (const an of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                for (const ad of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT112]) {
                    for (const sn of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                        for (const sd of [MAX_UINT32, MAX_UINT64, MAX_UINT96, MAX_UINT128]) {
                            for (const at of [0, 1, 2, 3]) {
                                for (const ct of [0, 1, 2, 3]) {
                                    for (const w of [0, 20, 80, 100]) {
                                        calcAverageRateTest(an, ad, sn, sd, at, ct, w);
                                    }
                                }
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
                                for (const at of [0, 1, 2, 3]) {
                                    for (const ct of [0, 1, 2, 3]) {
                                        for (const w of [0, 20, 80, 100]) {
                                            isSpotRateStableTest(an, ad, sn, sd, md, at, ct, w);
                                        }
                                    }
                                }
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
                                for (const at of [0, 1, 2, 3]) {
                                    for (const ct of [0, 1, 2, 3]) {
                                        for (const w of [0, 20, 80, 100]) {
                                            isSpotRateStableTest(an, ad, sn, sd, md, at, ct, w);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        describe('isValid', () => {
            for (const n of [0, 1, 2, 3, MAX_UINT112]) {
                for (const d of [0, 1, 2, 3, MAX_UINT112]) {
                    for (const t of [0, 1, 2, 3, MAX_UINT32]) {
                        isValidTest(n, d, t);
                    }
                }
            }
        });

        describe('areEqual', () => {
            for (const n1 of [0, 1, 2, 3, 4, MAX_UINT112]) {
                for (const d1 of [0, 1, 2, 3, 4, MAX_UINT112]) {
                    for (const t1 of [0, 1, 2, 3, MAX_UINT32]) {
                        for (const n2 of [0, 1, 2, 3, 4, MAX_UINT112]) {
                            for (const d2 of [0, 1, 2, 3, 4, MAX_UINT112]) {
                                for (const t2 of [0, 1, 2, 3, MAX_UINT32]) {
                                    areEqualTest(n1, d1, t1, n2, d2, t2);
                                }
                            }
                        }
                    }
                }
            }
        });
    });
});
