import { BigNumber, ethers } from 'ethers';

const { id } = ethers.utils;

export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const MAX_UINT256 = BigNumber.from(2).pow(BigNumber.from(256)).sub(BigNumber.from(1));
export const ZERO_ADDRESS = ethers.constants.AddressZero;

export const roles = {
    BancorVault: {
        ROLE_ADMIN: id('ROLE_ADMIN'),
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER'),
        ROLE_NETWORK_TOKEN_MANAGER: id('ROLE_NETWORK_TOKEN_MANAGER')
    }
};
