import Contracts from '../../components/Contracts';
import { TestERC20Token } from '../../typechain';
import { NATIVE_TOKEN_ADDRESS } from './Constants';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import Decimal from 'decimal.js';
import { BigNumber, BigNumberish, ContractTransaction, BaseContract } from 'ethers';
import { ethers } from 'hardhat';

export type TokenWithAddress = TestERC20Token | { address: string };

export interface Fraction<T = Decimal> {
    n: T;
    d: T;
}

export interface BigNumberFraction {
    n: BigNumber;
    d: BigNumber;
}

type DecimalType = Fraction<Decimal> | Decimal | number;
type ToBigNumberReturn<T> = T extends Fraction<Decimal>
    ? Fraction<BigNumber>
    : T extends Decimal
    ? BigNumber
    : T extends number
    ? BigNumber
    : never;

type BigNumberType = Fraction<BigNumber> | BigNumber | number;
type ToDecimalReturn<T> = T extends Fraction<BigNumber>
    ? Fraction<Decimal>
    : T extends BigNumber
    ? Decimal
    : T extends number
    ? Decimal
    : never;

export const toBigNumber = <T extends DecimalType>(v: T): ToBigNumberReturn<T> => {
    if (v.hasOwnProperty('n') && v.hasOwnProperty('d')) {
        return {
            n: BigNumber.from((v as Fraction<Decimal>).n.toFixed()),
            d: BigNumber.from((v as Fraction<Decimal>).d.toFixed())
        } as ToBigNumberReturn<T>;
    }

    if (Decimal.isDecimal(v)) {
        return BigNumber.from((v as Decimal).toFixed()) as ToBigNumberReturn<T>;
    }

    return BigNumber.from(v) as ToBigNumberReturn<T>;
};

export const toDecimal = <T extends BigNumberType>(v: T): ToDecimalReturn<T> => {
    if (v.hasOwnProperty('n') && v.hasOwnProperty('d')) {
        return {
            n: new Decimal((v as Fraction<BigNumber>).n.toString()),
            d: new Decimal((v as Fraction<BigNumber>).d.toString())
        } as ToDecimalReturn<T>;
    }

    if (BigNumber.isBigNumber(v)) {
        return new Decimal(v.toString()) as ToDecimalReturn<T>;
    }

    return new Decimal(v.toString()) as ToDecimalReturn<T>;
};

export const toString = (fraction: Fraction) => `{n: ${fraction.n.toFixed()}, d: ${fraction.d.toFixed()}}`;

export const toAddress = (account: string | SignerWithAddress | BaseContract) =>
    typeof account === 'string' ? account : account.address;

export const getTransactionCost = async (res: ContractTransaction) => {
    const cumulativeGasUsed = (await res.wait()).cumulativeGasUsed;

    return BigNumber.from(res.gasPrice).mul(BigNumber.from(cumulativeGasUsed));
};

export const getBalance = async (token: TokenWithAddress, account: string | SignerWithAddress) => {
    const accountAddress = toAddress(account);
    const tokenAddress = token.address;
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
        return ethers.provider.getBalance(accountAddress);
    }
    return await (await Contracts.TestERC20Token.attach(tokenAddress)).balanceOf(accountAddress);
};

export const getBalances = async (tokens: TokenWithAddress[], account: string | SignerWithAddress) => {
    const balances: { [balance: string]: BigNumber } = {};
    for (const token of tokens) {
        balances[token.address] = await getBalance(token, account);
    }

    return balances;
};

export const transfer = async (
    sourceAccount: SignerWithAddress,
    token: TokenWithAddress,
    target: string | SignerWithAddress,
    amount: BigNumberish
) => {
    const targetAddress = toAddress(target);
    const tokenAddress = token.address;
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
        return await sourceAccount.sendTransaction({ to: targetAddress, value: amount });
    }
    return await (await Contracts.TestERC20Token.attach(tokenAddress))
        .connect(sourceAccount)
        .transfer(targetAddress, amount);
};
