import Decimal from 'decimal.js';
import { ethers } from 'ethers';

const {
    constants: { AddressZero, MaxUint256 }
} = ethers;

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

const EXP_INPUT_TOO_HIGH = 16;
const EXP_DECAY_LAMBDA = new Decimal('0.0000000142857142857143');

export const Exponentiation = {
    INPUT_TOO_HIGH: EXP_INPUT_TOO_HIGH
};

export const ExponentialDecay = {
    LAMBDA: EXP_DECAY_LAMBDA,
    MAX_DURATION: new Decimal(1).div(EXP_DECAY_LAMBDA).mul(EXP_INPUT_TOO_HIGH).floor().toNumber()
};
