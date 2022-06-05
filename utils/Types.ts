import { MAX_UINT256, PPM_RESOLUTION } from './Constants';
import { DEFAULT_DECIMALS } from './TokenData';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish } from 'ethers';

export type Addressable = { address: string };

export interface Fraction<T = number> {
    n: T;
    d: T;
}

export interface BigNumberFraction {
    n: BigNumber;
    d: BigNumber;
}

type ToBigNumberInput = Fraction<Decimal> | Decimal | BigNumber | number;
type ToBigNumberReturn<T> = T extends Fraction<Decimal>
    ? Fraction<BigNumber>
    : T extends Decimal
    ? BigNumber
    : T extends BigNumber
    ? BigNumber
    : T extends number
    ? BigNumber
    : never;

type ToDecimalInput = Fraction<BigNumber> | Decimal | BigNumber | number;
type ToDecimalReturn<T> = T extends Fraction<BigNumber>
    ? Fraction<Decimal>
    : T extends BigNumber
    ? Decimal
    : T extends Decimal
    ? Decimal
    : T extends number
    ? Decimal
    : never;

// eslint-disable-next-line no-prototype-builtins
export const isFraction = (v: any) => v.hasOwnProperty('n') && v.hasOwnProperty('d');

export const toBigNumber = <T extends ToBigNumberInput>(v: T): ToBigNumberReturn<T> => {
    if (BigNumber.isBigNumber(v)) {
        return v as BigNumber as ToBigNumberReturn<T>;
    }

    if (isFraction(v)) {
        return {
            n: BigNumber.from((v as Fraction<Decimal>).n.toFixed()),
            d: BigNumber.from((v as Fraction<Decimal>).d.toFixed())
        } as Fraction<BigNumber> as ToBigNumberReturn<T>;
    }

    if (Decimal.isDecimal(v)) {
        return BigNumber.from((v as Decimal).toFixed()) as BigNumber as ToBigNumberReturn<T>;
    }

    return BigNumber.from(v) as BigNumber as ToBigNumberReturn<T>;
};

export const toDecimal = <T extends ToDecimalInput>(v: T): ToDecimalReturn<T> => {
    if (Decimal.isDecimal(v)) {
        return v as Decimal as ToDecimalReturn<T>;
    }

    if (isFraction(v)) {
        return {
            n: new Decimal((v as Fraction<BigNumber>).n.toString()),
            d: new Decimal((v as Fraction<BigNumber>).d.toString())
        } as Fraction<Decimal> as ToDecimalReturn<T>;
    }

    if (BigNumber.isBigNumber(v)) {
        return new Decimal(v.toString()) as Decimal as ToDecimalReturn<T>;
    }

    return new Decimal(v.toString()) as Decimal as ToDecimalReturn<T>;
};

export const toString = <T extends BigNumber | Decimal | number>(fraction: Fraction<T>) => {
    if (Decimal.isDecimal(fraction.n)) {
        return `{n: ${(fraction as Fraction<Decimal>).n.toFixed()}, d: ${(fraction as Fraction<Decimal>).d.toFixed()}}`;
    }

    return `{n: ${fraction.n.toString()}, d: ${fraction.d.toString()}}`;
};

type Uint512 = { hi: BigNumber; lo: BigNumber };

export const toUint512 = (x: BigNumber): Uint512 => {
    return { hi: x.shr(256), lo: x.and(MAX_UINT256) };
};

export const fromUint512 = (x: Uint512): BigNumber => {
    return x.hi.shl(256).or(x.lo);
};

type ToWeiInput = Decimal | BigNumberish;

export const toWei = <T extends ToWeiInput>(v: T, decimals = DEFAULT_DECIMALS): BigNumber => {
    if (Decimal.isDecimal(v)) {
        return BigNumber.from((v as Decimal).mul(new Decimal(10).pow(decimals)).toFixed());
    }

    return BigNumber.from(v).mul(BigNumber.from(10).pow(decimals));
};

export const toPPM = (percent: number | undefined): number => (percent ? percent * (PPM_RESOLUTION / 100) : 0);
export const fromPPM = (ppm: number | undefined): number => (ppm ? ppm / (PPM_RESOLUTION / 100) : 0);

export const percentsToPPM = (percents: number | string) => {
    let value: number;
    if (typeof percents === 'string') {
        value = Number(percents.endsWith('%') ? percents.slice(0, -1) : percents);
    } else {
        value = percents;
    }

    return (value * PPM_RESOLUTION) / 100;
};

export const toCents = (dollars: number) => Math.ceil(dollars * 100);

export const min = (a: BigNumberish, b: BigNumberish) =>
    BigNumber.from(a).lt(b) ? BigNumber.from(a) : BigNumber.from(b);

export const max = (a: BigNumberish, b: BigNumberish) =>
    BigNumber.from(a).gt(b) ? BigNumber.from(a) : BigNumber.from(b);
