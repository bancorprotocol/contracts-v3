import { BigNumber, ethers } from 'ethers';

const {
    constants: { AddressZero, MaxUint256 }
} = ethers;

export const DEFAULT_DECIMALS = BigNumber.from(18);
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const NATIVE_TOKEN_DECIMALS = DEFAULT_DECIMALS;
export const MAX_UINT256 = MaxUint256;
export const ZERO_ADDRESS = AddressZero;
export const INVALID_FRACTION = { n: BigNumber.from(0), d: BigNumber.from(0) };
export const ZERO_FRACTION = { n: BigNumber.from(0), d: BigNumber.from(1) };
export const PPM_RESOLUTION = BigNumber.from(1_000_000);
export const NETWORK_TOKEN_POOL_TOKEN_NAME = 'Bancor BNT Pool Token';
export const NETWORK_TOKEN_POOL_TOKEN_SYMBOL = 'bnBNT';
export const FEE_TYPES = {
    Trading: 0,
    Withdrawal: 1,
    FlashLoan: 2
};
