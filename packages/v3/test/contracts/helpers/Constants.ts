import { BigNumber, ethers } from 'ethers';

export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const MAX_UINT256 = BigNumber.from(2).pow(BigNumber.from(256)).sub(BigNumber.from(1));
export const ZERO_ADDRESS = ethers.constants.AddressZero;
