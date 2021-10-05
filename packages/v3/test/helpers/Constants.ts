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
export const NETWORK_TOKEN_POOL_TOKEN_NAME = `Bancor ${BNT} Pool Token`;
export const NETWORK_TOKEN_POOL_TOKEN_SYMBOL = `bn${BNT}`;
export const FeeTypes = {
    Trading: 0,
    Withdrawal: 1,
    FlashLoan: 2
};

// TODO: Common, BancorNetwork, etc.
// move to errors
enum CustomError {
    AccessDenied,
    AlreadyExists,
    DeadlineExpired,
    DepositLimitExceeded,
    EthAmountMismatch,
    InsufficientAllowance,
    InvalidAddress,
    InvalidExternalAddress,
    InvalidFee,
    InvalidPool,
    InvalidPoolBalance,
    InvalidPortion,
    InvalidRate,
    InvalidToken,
    InvalidTokens,
    InvalidType,
    MintingLimitExceeded,
    MinLiquidityNotSet,
    NetworkLiquidityDisabled,
    NetworkLiquidityTooLow,
    NoInitialRate,
    NotWhitelisted,
    PermitUnsupported,
    ReturnAmountTooLow,
    SameOwner,
    TradingDisabled,
    WithdrawalNotAllowed,
    ZeroTargetAmount,
    ZeroValue
}

// export all the errors as functors such that it'd be possible to write parametrized expectations such
// as: revertedWith(Errors.SomeError(1, "Error"))
const ErrorTypes = Object.keys(CustomError).filter((x) => !(parseInt(x) >= 0));
type CustomErrors = {
    [key: typeof ErrorTypes[number]]: (...args: any[]) => string;
};
export const Errors: CustomErrors = Object.fromEntries(
    ErrorTypes.map((err: string) => [err, (...args: any[]) => `${err}(${args.join(', ')})`])
);
