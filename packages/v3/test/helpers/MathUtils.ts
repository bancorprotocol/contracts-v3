import Decimal from 'decimal.js';

Decimal.set({ precision: 155, rounding: Decimal.ROUND_DOWN, toExpPos: 40 });

const floorSqrt = (n: Decimal) => n.sqrt().floor();

const ceilSqrt = (n: Decimal) => n.sqrt().ceil();

const productRatio = (an: Decimal, bn: Decimal, ad: Decimal, bd: Decimal) => [an.mul(bn), ad.mul(bd)];

const reducedRatio = (a: Decimal, b: Decimal, max: Decimal) => {
    if (a.gt(max) || b.gt(max)) {
        return normalizedRatio(a, b, max);
    }

    return [a, b];
};

const normalizedRatio = (a: Decimal, b: Decimal, scale: Decimal) => {
    if (a.lte(b)) {
        return accurateRatio(a, b, scale);
    }

    return accurateRatio(b, a, scale).slice().reverse();
};

const accurateRatio = (a: Decimal, b: Decimal, scale: Decimal) => [a, b].map((x) => x.div(a.add(b)).mul(scale));

const roundDiv = (a: Decimal, b: Decimal) => new Decimal(a.div(b).toFixed(0, Decimal.ROUND_HALF_UP));

const mulDivF = (a: Decimal, b: Decimal, c: Decimal) => a.mul(b).div(c).floor();

const mulDivC = (a: Decimal, b: Decimal, c: Decimal) => a.mul(b).div(c).ceil();

const hMax = (b: Decimal, c: Decimal, d: Decimal, e: Decimal, n: Decimal) => {
    n = n.div(1000000);
    return b.mul(d).mul(e).mul(n).mul(b.add(c)).div(
        b.pow(3)
        .add(b.pow(2).mul(c.mul(3).sub(e.mul(2))))
        .add(b.mul(e.pow(2).mul(n.add(1))))
        .add(c.mul(c.mul(3).sub(e.mul(4))))
        .add(c.mul(c.sub(e).pow(2)))
    );
};

const decimalize = <C>(func: Function) => {
    return (...args: any[]): C => {
        const res = func(...args.map((x) => new Decimal(x.toString())));
        if (Array.isArray(res)) {
            return res.map((x) => new Decimal(x.toString())) as unknown as C;
        }

        return new Decimal(res.toString()) as unknown as C;
    };
};

export default {
    Decimal,

    floorSqrt: decimalize<Decimal>(floorSqrt),
    ceilSqrt: decimalize<Decimal>(ceilSqrt),
    productRatio: decimalize<Decimal[]>(productRatio),
    reducedRatio: decimalize<Decimal[]>(reducedRatio),
    normalizedRatio: decimalize<Decimal[]>(normalizedRatio),
    accurateRatio: decimalize<Decimal[]>(accurateRatio),
    roundDiv: decimalize<Decimal>(roundDiv),
    mulDivF: decimalize<Decimal>(mulDivF),
    mulDivC: decimalize<Decimal>(mulDivC),
    hMax: decimalize<Decimal>(hMax)
};
