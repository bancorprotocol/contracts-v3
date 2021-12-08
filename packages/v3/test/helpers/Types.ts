import { PPM_RESOLUTION, DEFAULT_DECIMALS } from './Constants';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';

export interface Fraction<T = Decimal> {
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

export interface AverageRate<T> {
    rate: Fraction<T>;
    time: T;
}

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

export const toUint512 = (x: BigNumber) => {
    return { hi: x.shr(256), lo: x.shl(256).shr(256) };
};

export const fromUint512 = (hi: BigNumber, lo: BigNumber) => {
    return hi.shl(256).or(lo);
};

type ToWeiInput = Decimal | BigNumber | number;

export const toWei = <T extends ToWeiInput>(v: T): BigNumber => {
    if (Decimal.isDecimal(v)) {
        return BigNumber.from((v as Decimal).mul(new Decimal(10).pow(DEFAULT_DECIMALS)).toFixed());
    }

    return BigNumber.from(v).mul(BigNumber.from(10).pow(DEFAULT_DECIMALS));
};

export const toPPM = (percent: number): number => percent * (PPM_RESOLUTION / 100);
export const fromPPM = (ppm: number): number => ppm / (PPM_RESOLUTION / 100);
