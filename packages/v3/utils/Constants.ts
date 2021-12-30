import Decimal from 'decimal.js';
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

export enum ContractNames {
    NetworkToken = 'NetworkToken',
    NetworkTokenGovernance = 'NetworkTokenGovernance',
    GovToken = 'GovToken',
    GovTokenGovernance = 'GovTokenGovernance'
}

export enum DeploymentTags {
    V2 = 'V2'
}

export enum Networks {
    HARDHAT = 'hardhat',
    LOCALHOST = 'localhost',
    HARDHAT_MAINNET_FORK = 'hardhat-mainnet-fork',
    MAINNET = 'mainnet'
}

export const DEFAULT_DECIMALS = 18;
export const NATIVE_TOKEN_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
export const NATIVE_TOKEN_DECIMALS = DEFAULT_DECIMALS;
export const MAX_UINT256 = MaxUint256;
export const ZERO_ADDRESS = AddressZero;
export const ZERO_FRACTION = { n: 0, d: 1 };
export const PPM_RESOLUTION = 1_000_000;

export enum FeeTypes {
    Trading = 0,
    Withdrawal = 1,
    FlashLoan = 2
}

export enum StakingRewardsDistributionTypes {
    Flat = 0,
    ExponentialDecay = 1
}

export const Exponentiation = {
    INPUT_TOO_HIGH: 16
};

export const ExponentialDecay = {
    LAMBDA: new Decimal('0.0000000142857142857143'),
    ESTIMATED_PROGRAM_DURATION: 35.5 * 365 * 24 * 60 * 60 // 35.4 years
};
