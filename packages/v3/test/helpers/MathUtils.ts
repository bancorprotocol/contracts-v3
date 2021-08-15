import { Fraction, toDecimal } from './Utils';
import Decimal from 'decimal.js';

const floorSqrt = (n: Decimal) => n.sqrt().floor();

const ceilSqrt = (n: Decimal) => n.sqrt().ceil();

const productRatio = (a: Fraction, b: Fraction) => [a.n.mul(b.n), a.d.mul(b.d)];

const reducedRatio = (r: Fraction, max: Decimal) => {
    if (r.n.gt(max) || r.d.gt(max)) {
        return normalizedRatio(r, max);
    }

    return r;
};

const normalizedRatio = (r: Fraction, scale: Decimal) => {
    if (r.n.lte(r.d)) {
        return accurateRatio(r, scale);
    }

    const invR = { n: r.d, d: r.n };
    const res = accurateRatio(invR, scale);
    return { n: res.d, d: res.n };
};

const accurateRatio = (r: Fraction, scale: Decimal) => ({
    n: r.n.div(r.n.add(r.d)).mul(scale),
    d: r.d.div(r.n.add(r.d)).mul(scale)
});

const roundDiv = (a: Decimal, b: Decimal) => new Decimal(a.div(b).toFixed(0, Decimal.ROUND_HALF_UP));

const mulDivF = (a: Decimal, b: Decimal, c: Decimal) => a.mul(b).div(c).floor();

const mulDivC = (a: Decimal, b: Decimal, c: Decimal) => a.mul(b).div(c).ceil();

const decimalize = <C>(func: Function) => {
    return (...args: any[]): C => {
        return func(...args.map((x) => toDecimal(x)));
    };
};

export default {
    floorSqrt: decimalize<Decimal>(floorSqrt),
    ceilSqrt: decimalize<Decimal>(ceilSqrt),
    productRatio: decimalize<Decimal[]>(productRatio),
    reducedRatio: decimalize<Decimal[]>(reducedRatio),
    normalizedRatio: decimalize<Decimal[]>(normalizedRatio),
    accurateRatio: decimalize<Decimal[]>(accurateRatio),
    roundDiv: decimalize<Decimal>(roundDiv),
    mulDivF: decimalize<Decimal>(mulDivF),
    mulDivC: decimalize<Decimal>(mulDivC)
};
