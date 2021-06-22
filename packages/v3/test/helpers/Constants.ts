import { ethers } from 'ethers';

const {
    utils: { id },
    constants: { AddressZero, MaxUint256 }
} = ethers;

export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const MAX_UINT256 = MaxUint256;
export const ZERO_ADDRESS = AddressZero;

export const roles = {
    BancorVault: {
        ROLE_ADMIN: id('ROLE_ADMIN'),
        ROLE_ASSET_MANAGER: id('ROLE_ASSET_MANAGER'),
        ROLE_NETWORK_TOKEN_MANAGER: id('ROLE_NETWORK_TOKEN_MANAGER')
    }
};
