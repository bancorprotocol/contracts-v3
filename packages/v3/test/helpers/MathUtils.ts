import { Fraction, toDecimal } from './Types';
import Decimal from 'decimal.js';

// eslint-disable-next-line @typescript-eslint/ban-types
const decimalize = <C>(func: Function) => {
    return (...args: any[]): C => {
        return func(...args.map((x) => toDecimal(x)));
    };
};

export const floorSqrt = decimalize<Decimal>((n: Decimal) => n.sqrt().floor());

export const reducedRatio = decimalize<Fraction<Decimal>>((r: Fraction, max: Decimal): Fraction => {
    if (r.n.gt(max) || r.d.gt(max)) {
        return normalizedRatio(r, max);
    }

    return r;
});

export const normalizedRatio = decimalize<Fraction<Decimal>>((r: Fraction, scale: Decimal): Fraction => {
    if (r.n.lte(r.d)) {
        return accurateRatio(r, scale);
    }

    const invR = { n: r.d, d: r.n };
    const res = accurateRatio(invR, scale);
    return { n: res.d, d: res.n };
});

export const accurateRatio = decimalize<Fraction<Decimal>>(
    (r: Fraction, scale: Decimal): Fraction => ({
        n: r.n.div(r.n.add(r.d)).mul(scale),
        d: r.d.div(r.n.add(r.d)).mul(scale)
    })
);

export const roundDiv = decimalize<Decimal>(
    (a: Decimal, b: Decimal) => new Decimal(a.div(b).toFixed(0, Decimal.ROUND_HALF_UP))
);

export const mulDivF = decimalize<Decimal>((a: Decimal, b: Decimal, c: Decimal) => a.mul(b).div(c).floor());

export const mulDivC = decimalize<Decimal>((a: Decimal, b: Decimal, c: Decimal) => a.mul(b).div(c).ceil());
