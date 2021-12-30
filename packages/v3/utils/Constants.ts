import { ethers } from 'ethers';

const {
    constants: { AddressZero, MaxUint256 }
} = ethers;

export enum Symbols {
    ETH = 'ETH',
    BNT = 'BNT',
    bnBNT = 'bnBNT',
    vBNT = 'vBNT',
    TKN = 'TKN'
}

export enum TokenNames {
    BNT = 'Bancor Network Token',
    vBNT = 'Bancor Governance Token',
    bnBNT = 'Bancor BNT Pool Token',
    TKN = 'Test Token'
}

export const DEFAULT_DECIMALS = 18;
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const NATIVE_TOKEN_DECIMALS = DEFAULT_DECIMALS;
export const MAX_UINT256 = MaxUint256;
export const ZERO_ADDRESS = AddressZero;
export const ZERO_FRACTION = { n: 0, d: 1 };
export const PPM_RESOLUTION = 1_000_000;
export const FeeTypes = {
    Trading: 0,
    Withdrawal: 1,
    FlashLoan: 2
};
