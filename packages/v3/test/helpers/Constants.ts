import { ethers, BigNumber } from 'ethers';

const {
    constants: { AddressZero, MaxUint256 }
} = ethers;

export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const MAX_UINT256 = MaxUint256;
export const ZERO_ADDRESS = AddressZero;
export const PPM_RESOLUTION = BigNumber.from(1_000_000);
export const NETWORK_TOKEN_POOL_TOKEN_NAME = 'Bancor BNT Pool Token';
export const NETWORK_TOKEN_POOL_TOKEN_SYMBOL = 'bnBNT';
