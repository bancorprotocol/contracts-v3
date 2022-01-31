import { duration } from './Time';
import { toPPM } from './Types';
import Decimal from 'decimal.js';
import { ethers } from 'ethers';

const {
    constants: { AddressZero, MaxUint256 }
} = ethers;

export enum DeploymentNetwork {
    HARDHAT = 'hardhat',
    LOCALHOST = 'localhost',
    MAINNET = 'mainnet'
}

export const MAX_UINT256 = MaxUint256;
export const ZERO_BYTES = '0x';
export const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000';
export const ZERO_ADDRESS = AddressZero;
export const ZERO_FRACTION = { n: 0, d: 1 };
export const PPM_RESOLUTION = 1_000_000;

export enum TradingStatusUpdateReason {
    Default = 0,
    Admin = 1,
    MinLiquidity = 2
}

export enum FeeType {
    Trading = 0,
    Withdrawal = 1,
    FlashLoan = 2
}

export enum StakingRewardsDistributionType {
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

export const DEFAULT_LOCK_DURATION = duration.days(7);
export const DEFAULT_WITHDRAWAL_WINDOW_DURATION = duration.days(3);

export const EMA_AVERAGE_RATE_WEIGHT = 4;
export const EMA_SPOT_RATE_WEIGHT = 1;
export const LIQUIDITY_GROWTH_FACTOR = 2;
export const BOOTSTRAPPING_LIQUIDITY_BUFFER_FACTOR = 2;

export const DEFAULT_TRADING_FEE_PPM = toPPM(0.2);
export const AVERAGE_RATE_MAX_DEVIATION_PPM = 10000;

export enum PoolType {
    Standard = 1
}
