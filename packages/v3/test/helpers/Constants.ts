import { BigNumber, ethers } from 'ethers';

const {
    constants: { AddressZero, MaxUint256 }
} = ethers;

export const ETH = 'ETH';
export const BNT = 'BNT';
export const vBNT = 'vBNT';
export const TKN = 'TKN';
export const DEFAULT_DECIMALS = BigNumber.from(18);
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const NATIVE_TOKEN_DECIMALS = DEFAULT_DECIMALS;
export const MAX_UINT256 = MaxUint256;
export const ZERO_ADDRESS = AddressZero;
export const INVALID_FRACTION = { n: BigNumber.from(0), d: BigNumber.from(0) };
export const ZERO_FRACTION = { n: BigNumber.from(0), d: BigNumber.from(1) };
export const PPM_RESOLUTION = BigNumber.from(1_000_000);
export const MASTER_POOL_TOKEN_NAME = `Bancor ${BNT} Pool Token`;
export const MASTER_POOL_TOKEN_SYMBOL = `bn${BNT}`;
export const FeeTypes = {
    Trading: 0,
    Withdrawal: 1,
    FlashLoan: 2
};
export const SECOND = 1;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
export const MONTH = 30 * DAY;
export const YEAR = 365 * DAY;
