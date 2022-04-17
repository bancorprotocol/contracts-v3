import { BigNumber } from 'ethers';
import { MathEx } from '../utility/MathEx';
import { Constants } from '../utility/Common';

export const BNTPool = {
    poolTokenToUnderlying,
    underlyingToPoolToken,
    poolTokenAmountToBurn,
    deposit,
    withdraw
};

function poolTokenToUnderlying(
    poolTokenAmount: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber
) {
    return _poolTokenToUnderlying(poolTokenAmount, poolTokenSupply, stakedBalance);
}

function underlyingToPoolToken(
    reserveTokenAmount: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber
) {
    return _underlyingToPoolToken(reserveTokenAmount, poolTokenSupply, stakedBalance);
}

function poolTokenAmountToBurn(
    tokenAmountToDistribute: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber,
    protocolPoolTokenAmount: BigNumber
) {
    const val = tokenAmountToDistribute.mul(poolTokenSupply);
    return MathEx.mulDivF(poolTokenSupply, val, val.add(stakedBalance.mul(poolTokenSupply.sub(protocolPoolTokenAmount))))
}

function deposit(
    reserveTokenAmount: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber
) {
    return { poolTokenAmount: _underlyingToPoolToken(reserveTokenAmount, poolTokenSupply, stakedBalance) };
}

function withdraw(
    poolTokenAmount: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber,
    withdrawalFeePPM: BigNumber
) {
    const reserveTokenAmount = _poolTokenToUnderlying(poolTokenAmount, poolTokenSupply, stakedBalance);
    const withdrawalFeeAmount = MathEx.mulDivF(reserveTokenAmount, withdrawalFeePPM, Constants.PPM_RESOLUTION);
    return { reserveTokenAmount: reserveTokenAmount.sub(withdrawalFeeAmount), withdrawalFeeAmount: withdrawalFeeAmount };
}

function _poolTokenToUnderlying(
    poolTokenAmount: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber
) {
    return MathEx.mulDivF(poolTokenAmount, stakedBalance, poolTokenSupply);
}

function _underlyingToPoolToken(
    reserveTokenAmount: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber
) {
    return MathEx.mulDivC(reserveTokenAmount, poolTokenSupply, stakedBalance);
}
