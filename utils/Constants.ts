import { duration } from './Time';
import { toPPM } from './Types';
import Decimal from 'decimal.js';
import { ethers } from 'ethers';

const {
    constants: { AddressZero, MaxUint256 }
} = ethers;

export enum DeploymentNetwork {
    Mainnet = 'mainnet',
    Rinkeby = 'rinkeby',
    Hardhat = 'hardhat',
    Tenderly = 'tenderly'
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

export enum RewardsDistributionType {
    Flat = 0,
    ExpDecay = 1
}

export const EXP2_INPUT_TOO_HIGH = new Decimal(16).div(new Decimal(2).ln());

export const DEFAULT_LOCK_DURATION = duration.days(7);

export const LIQUIDITY_GROWTH_FACTOR = 2;
export const BOOTSTRAPPING_LIQUIDITY_BUFFER_FACTOR = 2;
export const DEFAULT_TRADING_FEE_PPM = toPPM(0.2);
export const DEFAULT_FLASH_LOAN_FEE_PPM = toPPM(0);
export const RATE_MAX_DEVIATION_PPM = toPPM(1);
export const EMA_AVERAGE_RATE_WEIGHT = 4;
export const EMA_SPOT_RATE_WEIGHT = 1;

export enum PoolType {
    Standard = 1
}
