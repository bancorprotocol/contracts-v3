import { BigNumber } from 'ethers';
import { MathEx } from '../utility/MathEx';
import { Constants, TokenType } from '../utility/Common';
import { PoolCollectionWithdrawal } from './PoolCollectionWithdrawal';

export const PoolCollection = {
    deposit,
    withdraw,
    tradeBySourceAmount,
    tradeByTargetAmount,
    tradeOutputAndFeeBySourceAmount,
    tradeInputAndFeeByTargetAmount,
    poolTokenToUnderlying,
    underlyingToPoolToken,
    poolTokenAmountToBurn,
};

interface TradeIntermediateResult {
    sourceAmount: BigNumber;
    targetAmount: BigNumber;
    limit: BigNumber;
    tradingFeeAmount: BigNumber;
    networkFeeAmount: BigNumber;
    sourceBalance: BigNumber;
    targetBalance: BigNumber;
    stakedBalance: BigNumber;
    pool: TokenType;
    isSourceBNT: boolean;
    bySourceAmount: boolean;
    tradingFeePPM: BigNumber;
    networkFeePPM: BigNumber;
    contextId: string;
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
    tradingFeePPM: BigNumber,
    withdrawalFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber,
    tknMasterVaultBalance: BigNumber,
    tknProtectionVaultBalance: BigNumber
) {
    const baseTokenExcessAmount = tknMasterVaultBalance.sub(tknTradingLiquidity);

    const baseTokensWithdrawalAmount = _poolTokenToUnderlying(poolTokenAmount, poolTokenSupply, stakedBalance);

    const output = PoolCollectionWithdrawal.calculateWithdrawalAmounts(
        bntTradingLiquidity,
        tknTradingLiquidity,
        baseTokenExcessAmount,
        stakedBalance,
        tknProtectionVaultBalance,
        tradingFeePPM,
        withdrawalFeePPM,
        baseTokensWithdrawalAmount
    );

    const amounts = {
        baseTokensToTransferFromMasterVault: output.s,
        bntToMintForProvider: output.t,
        baseTokensToTransferFromEPV: output.u,
        baseTokensTradingLiquidityDelta: output.r,
        bntTradingLiquidityDelta: output.p,
        bntProtocolHoldingsDelta: output.q,
        baseTokensWithdrawalFee: output.v,
        baseTokensWithdrawalAmount: baseTokensWithdrawalAmount,
        poolTokenSupply: poolTokenSupply,
        newBaseTokenTradingLiquidity: tknTradingLiquidity.add(output.r),
        newBNTTradingLiquidity: bntTradingLiquidity.add(output.p)
    };

    return {
        totalAmount: amounts.baseTokensWithdrawalAmount.sub(amounts.baseTokensWithdrawalFee),
        baseTokenAmount: amounts.baseTokensToTransferFromMasterVault.add(amounts.baseTokensToTransferFromEPV),
        bntAmount: amounts.bntToMintForProvider
    };
}

function tradeBySourceAmount(
    sourceToken: TokenType,
    targetToken: TokenType,
    sourceAmount: BigNumber,
    targetAmountMin: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    const result = _initTrade(
        sourceToken,
        targetToken,
        sourceAmount,
        targetAmountMin,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity,
        true
    );

    _performTrade(result);

    return {
        amount: result.targetAmount,
        tradingFeeAmount: result.tradingFeeAmount,
        networkFeeAmount: result.networkFeeAmount
    };
}

function tradeByTargetAmount(
    sourceToken: TokenType,
    targetToken: TokenType,
    targetAmount: BigNumber,
    sourceAmountMax: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    const result = _initTrade(
        sourceToken,
        targetToken,
        targetAmount,
        sourceAmountMax,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity,
        false
    );

    _performTrade(result);

    return {
        amount: result.sourceAmount,
        tradingFeeAmount: result.tradingFeeAmount,
        networkFeeAmount: result.networkFeeAmount
    };
}

function tradeOutputAndFeeBySourceAmount(
    sourceToken: TokenType,
    targetToken: TokenType,
    sourceAmount: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    const result = _initTrade(
        sourceToken,
        targetToken,
        sourceAmount,
        Constants.ONE,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity,
        true
    );

    _processTrade(result);

    return {
        amount: result.targetAmount,
        tradingFeeAmount: result.tradingFeeAmount,
        networkFeeAmount: result.networkFeeAmount
    };
}

function tradeInputAndFeeByTargetAmount(
    sourceToken: TokenType,
    targetToken: TokenType,
    targetAmount: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    const result = _initTrade(
        sourceToken,
        targetToken,
        targetAmount,
        Constants.MAX_UINT256,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity,
        false
    );

    _processTrade(result);

    return {
        amount: result.sourceAmount,
        tradingFeeAmount: result.tradingFeeAmount,
        networkFeeAmount: result.networkFeeAmount
    };
}

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
    return MathEx.mulDivF(poolTokenSupply, val, val.add(stakedBalance.mul(poolTokenSupply.sub(protocolPoolTokenAmount))));
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

function _tradeAmountAndFeeBySourceAmount(
    sourceBalance: BigNumber,
    targetBalance: BigNumber,
    tradingFeePPM: BigNumber,
    sourceAmount: BigNumber
) {
    if (sourceBalance.eq(0) || targetBalance.eq(0)) {
        throw new Error('InsufficientLiquidity');
    }

    const targetAmount = MathEx.mulDivF(targetBalance, sourceAmount, sourceBalance.add(sourceAmount));
    const tradingFeeAmount = MathEx.mulDivF(targetAmount, tradingFeePPM, Constants.PPM_RESOLUTION);

    return { amount: targetAmount.sub(tradingFeeAmount), tradingFeeAmount: tradingFeeAmount };
}

function _tradeAmountAndFeeByTargetAmount(
    sourceBalance: BigNumber,
    targetBalance: BigNumber,
    tradingFeePPM: BigNumber,
    targetAmount: BigNumber
) {
    if (sourceBalance.eq(0)) {
        throw new Error('InsufficientLiquidity');
    }

    const tradingFeeAmount = MathEx.mulDivF(targetAmount, tradingFeePPM, Constants.PPM_RESOLUTION.sub(tradingFeePPM));
    const fullTargetAmount = targetAmount.add(tradingFeeAmount);
    const sourceAmount = MathEx.mulDivF(sourceBalance, fullTargetAmount, targetBalance.sub(fullTargetAmount));

    return { amount: sourceAmount, tradingFeeAmount: tradingFeeAmount };
}

function _initTrade(
    sourceToken: TokenType,
    targetToken: TokenType,
    amount: BigNumber,
    limit: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber,
    bySourceAmount: boolean
) {
    const result = {} as TradeIntermediateResult;

    const isSourceBNT = sourceToken === TokenType.BNT;
    const isTargetBNT = targetToken === TokenType.BNT;

    if (isSourceBNT && !isTargetBNT) {
        result.isSourceBNT = true;
        result.pool = targetToken;
    } else if (!isSourceBNT && isTargetBNT) {
        result.isSourceBNT = false;
        result.pool = sourceToken;
    } else {
        throw new Error('DoesNotExist');
    }

    result.bySourceAmount = bySourceAmount;

    if (result.bySourceAmount) {
        result.sourceAmount = amount;
    } else {
        result.targetAmount = amount;
    }

    result.limit = limit;
    result.tradingFeePPM = tradingFeePPM;
    result.networkFeePPM = networkFeePPM;

    if (result.isSourceBNT) {
        result.sourceBalance = bntTradingLiquidity;
        result.targetBalance = tknTradingLiquidity;
    } else {
        result.sourceBalance = tknTradingLiquidity;
        result.targetBalance = bntTradingLiquidity;
    }

    result.stakedBalance = stakedBalance;

    return result;
}

function _processTrade(result: TradeIntermediateResult) {
    let tradeAmountAndFee;

    if (result.bySourceAmount) {
        tradeAmountAndFee = _tradeAmountAndFeeBySourceAmount(
            result.sourceBalance,
            result.targetBalance,
            result.tradingFeePPM,
            result.sourceAmount
        );

        result.targetAmount = tradeAmountAndFee.amount;

        if (result.targetAmount.lt(result.limit)) {
            throw new Error('InsufficientTargetAmount');
        }
    } else {
        tradeAmountAndFee = _tradeAmountAndFeeByTargetAmount(
            result.sourceBalance,
            result.targetBalance,
            result.tradingFeePPM,
            result.targetAmount
        );

        result.sourceAmount = tradeAmountAndFee.amount;

        if (result.sourceAmount.gt(result.limit)) {
            throw new Error('InsufficientSourceAmount');
        }
    }

    result.tradingFeeAmount = tradeAmountAndFee.tradingFeeAmount;

    result.sourceBalance = result.sourceBalance.add(result.sourceAmount);
    result.targetBalance = result.targetBalance.sub(result.targetAmount);

    if (result.isSourceBNT) {
        result.stakedBalance = result.stakedBalance.sub(result.tradingFeeAmount);
    }

    const targetNetworkFeeAmount = MathEx.mulDivF(result.tradingFeeAmount, result.networkFeePPM, Constants.PPM_RESOLUTION);

    result.targetBalance = result.targetBalance.sub(targetNetworkFeeAmount);

    if (!result.isSourceBNT) {
        result.networkFeeAmount = targetNetworkFeeAmount;

        return;
    }

    result.networkFeeAmount = _tradeAmountAndFeeBySourceAmount(
        result.targetBalance,
        result.sourceBalance,
        Constants.ZERO,
        targetNetworkFeeAmount
    ).amount;

    result.targetBalance = result.targetBalance.add(targetNetworkFeeAmount);
    result.sourceBalance = result.sourceBalance.sub(result.networkFeeAmount);
    result.stakedBalance = result.stakedBalance.sub(targetNetworkFeeAmount);
}

function _performTrade(result: TradeIntermediateResult) {
    _processTrade(result);
}
