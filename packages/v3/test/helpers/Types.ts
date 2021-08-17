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

export const isFraction = (v: any) => v.hasOwnProperty('n') && v.hasOwnProperty('d');

export const toBigNumber = <T extends ToBigNumberInput>(v: T): ToBigNumberReturn<T> => {
    if (BigNumber.isBigNumber(v)) {
        return v as BigNumber as ToBigNumberReturn<T>;
    }

    if (v.hasOwnProperty('n') && v.hasOwnProperty('d')) {
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

    if (v.hasOwnProperty('n') && v.hasOwnProperty('d')) {
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

export const toString = <T extends BigNumber | Decimal>(fraction: Fraction<T>) => {
    if (Decimal.isDecimal(fraction.n)) {
        return `{n: ${(fraction as Fraction<Decimal>).n.toFixed()}, d: ${(fraction as Fraction<Decimal>).d.toFixed()}}`;
    }

    return `{n: ${fraction.n.toString()}, d: ${fraction.d.toString()}}`;
};

type ToWeiInput = Decimal | BigNumber;
type ToWeiReturn<T> = T extends BigNumber ? BigNumber : T extends Decimal ? Decimal : never;

export const toWei = <T extends ToWeiInput>(v: T): ToWeiReturn<T> => {
    if (Decimal.isDecimal(v)) {
        return v.mul(10 ** 18) as ToWeiReturn<T>;
    }

    return (v as BigNumber).mul(BigNumber.from(10).pow(BigNumber.from(18))) as ToWeiReturn<T>;
};

export interface AverageRate<T> {
    rate: Fraction<T>;
    time: T;
}
