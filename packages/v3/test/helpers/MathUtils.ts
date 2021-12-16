import { toDecimal } from './Types';
import Decimal from 'decimal.js';

// eslint-disable-next-line @typescript-eslint/ban-types
const decimalize = <C>(func: Function) => {
    return (...args: any[]): C => {
        return func(...args.map((x) => toDecimal(x)));
    };
};

export const floorSqrt = decimalize<Decimal>((n: Decimal) => n.sqrt().floor());

export const roundDiv = decimalize<Decimal>(
    (a: Decimal, b: Decimal) => new Decimal(a.div(b).toFixed(0, Decimal.ROUND_HALF_UP))
);

export const mulDivF = decimalize<Decimal>((a: Decimal, b: Decimal, c: Decimal) => a.mul(b).div(c).floor());

export const mulDivC = decimalize<Decimal>((a: Decimal, b: Decimal, c: Decimal) => a.mul(b).div(c).ceil());
