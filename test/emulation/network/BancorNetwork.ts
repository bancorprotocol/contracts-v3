import { BNTPool } from '../pools/BNTPool';
import { PoolCollection } from '../pools/PoolCollection';
import { Constants, TokenType } from '../utility/Common';
import { BigNumber } from 'ethers';

export const BancorNetwork = {
    depositBNT,
    depositTKN,
    withdrawBNT,
    withdrawTKN,
    tradeBySourceAmountBNTtoTKN,
    tradeBySourceAmountTKNtoBNT,
    tradeByTargetAmountBNTtoTKN,
    tradeByTargetAmountTKNtoBNT,
    poolTokenToUnderlyingBNT,
    poolTokenToUnderlyingTKN,
    underlyingToPoolTokenBNT,
    underlyingToPoolTokenTKN,
    poolTokenAmountToBurnBNT,
    poolTokenAmountToBurnTKN
};

interface TradeResult {
    sourceAmount: BigNumber;
    targetAmount: BigNumber;
    tradingFeeAmount: BigNumber;
    networkFeeAmount: BigNumber;
}

function depositBNT(reserveTokenAmount: BigNumber, poolTokenSupply: BigNumber, stakedBalance: BigNumber) {
    return BNTPool.deposit(reserveTokenAmount, poolTokenSupply, stakedBalance);
}

function depositTKN(reserveTokenAmount: BigNumber, poolTokenSupply: BigNumber, stakedBalance: BigNumber) {
    return PoolCollection.deposit(reserveTokenAmount, poolTokenSupply, stakedBalance);
}

function withdrawBNT(
    poolTokenAmount: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber,
    withdrawalFeePPM: BigNumber
) {
    return BNTPool.withdraw(poolTokenAmount, poolTokenSupply, stakedBalance, withdrawalFeePPM);
}

function withdrawTKN(
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
    return PoolCollection.withdraw(
        poolTokenAmount,
        poolTokenSupply,
        stakedBalance,
        tradingFeePPM,
        withdrawalFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity,
        tknMasterVaultBalance,
        tknProtectionVaultBalance
    );
}

function tradeBySourceAmountBNTtoTKN(
    sourceAmount: BigNumber,
    targetAmountMin: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    return _trade(
        TokenType.BNT,
        TokenType.TKN,
        true,
        sourceAmount,
        targetAmountMin,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity
    );
}

function tradeBySourceAmountTKNtoBNT(
    sourceAmount: BigNumber,
    targetAmountMin: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    return _trade(
        TokenType.TKN,
        TokenType.BNT,
        true,
        sourceAmount,
        targetAmountMin,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity
    );
}

function tradeByTargetAmountBNTtoTKN(
    targetAmount: BigNumber,
    sourceAmountMax: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    return _trade(
        TokenType.BNT,
        TokenType.TKN,
        false,
        targetAmount,
        sourceAmountMax,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity
    );
}

function tradeByTargetAmountTKNtoBNT(
    targetAmount: BigNumber,
    sourceAmountMax: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    return _trade(
        TokenType.TKN,
        TokenType.BNT,
        false,
        targetAmount,
        sourceAmountMax,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity
    );
}

function poolTokenToUnderlyingBNT(poolTokenAmount: BigNumber, poolTokenSupply: BigNumber, stakedBalance: BigNumber) {
    return BNTPool.poolTokenToUnderlying(poolTokenAmount, poolTokenSupply, stakedBalance);
}

function poolTokenToUnderlyingTKN(poolTokenAmount: BigNumber, poolTokenSupply: BigNumber, stakedBalance: BigNumber) {
    return PoolCollection.poolTokenToUnderlying(poolTokenAmount, poolTokenSupply, stakedBalance);
}

function underlyingToPoolTokenBNT(reserveTokenAmount: BigNumber, poolTokenSupply: BigNumber, stakedBalance: BigNumber) {
    return BNTPool.underlyingToPoolToken(reserveTokenAmount, poolTokenSupply, stakedBalance);
}

function underlyingToPoolTokenTKN(reserveTokenAmount: BigNumber, poolTokenSupply: BigNumber, stakedBalance: BigNumber) {
    return PoolCollection.underlyingToPoolToken(reserveTokenAmount, poolTokenSupply, stakedBalance);
}

function poolTokenAmountToBurnBNT(
    tokenAmountToDistribute: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber,
    protocolPoolTokenAmount: BigNumber
) {
    return BNTPool.poolTokenAmountToBurn(
        tokenAmountToDistribute,
        poolTokenSupply,
        stakedBalance,
        protocolPoolTokenAmount
    );
}

function poolTokenAmountToBurnTKN(
    tokenAmountToDistribute: BigNumber,
    poolTokenSupply: BigNumber,
    stakedBalance: BigNumber,
    protocolPoolTokenAmount: BigNumber
) {
    return PoolCollection.poolTokenAmountToBurn(
        tokenAmountToDistribute,
        poolTokenSupply,
        stakedBalance,
        protocolPoolTokenAmount
    );
}

function _trade(
    sourceToken: TokenType,
    targetToken: TokenType,
    bySourceAmount: boolean,
    amount: BigNumber,
    limit: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    if ((sourceToken === TokenType.BNT) !== (targetToken === TokenType.BNT)) {
        const hop = _tradeBNT(
            sourceToken,
            targetToken,
            bySourceAmount,
            amount,
            limit,
            stakedBalance,
            tradingFeePPM,
            networkFeePPM,
            bntTradingLiquidity,
            tknTradingLiquidity
        );

        return {
            firstHopTradeResult: hop,
            lastHopTradeResult: hop,
            pendingNetworkFeeAmount: hop.networkFeeAmount
        };
    }

    if (sourceToken === TokenType.TKN && targetToken === TokenType.TKN) {
        const hops = _tradeTKN(
            sourceToken,
            targetToken,
            bySourceAmount,
            amount,
            limit,
            stakedBalance,
            tradingFeePPM,
            networkFeePPM,
            bntTradingLiquidity,
            tknTradingLiquidity
        );

        return {
            firstHopTradeResult: hops[0],
            lastHopTradeResult: hops[1],
            pendingNetworkFeeAmount: hops[0].networkFeeAmount.add(hops[1].networkFeeAmount)
        };
    }

    throw new Error('InvalidTokens');
}

function _tradeBNT(
    sourceToken: TokenType,
    targetToken: TokenType,
    bySourceAmount: boolean,
    amount: BigNumber,
    limit: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    const tradeFunc = bySourceAmount ? PoolCollection.tradeBySourceAmount : PoolCollection.tradeByTargetAmount;

    const tradeAmountsAndFee = tradeFunc(
        sourceToken,
        targetToken,
        amount,
        limit,
        stakedBalance,
        tradingFeePPM,
        networkFeePPM,
        bntTradingLiquidity,
        tknTradingLiquidity
    );

    return {
        sourceAmount: bySourceAmount ? amount : tradeAmountsAndFee.amount,
        targetAmount: bySourceAmount ? tradeAmountsAndFee.amount : amount,
        tradingFeeAmount: tradeAmountsAndFee.tradingFeeAmount,
        networkFeeAmount: tradeAmountsAndFee.networkFeeAmount,
        feeCollected: sourceToken === TokenType.TKN
    };
}

function _tradeTKN(
    sourceToken: TokenType,
    targetToken: TokenType,
    bySourceAmount: boolean,
    amount: BigNumber,
    limit: BigNumber,
    stakedBalance: BigNumber,
    tradingFeePPM: BigNumber,
    networkFeePPM: BigNumber,
    bntTradingLiquidity: BigNumber,
    tknTradingLiquidity: BigNumber
) {
    const hops = new Array<TradeResult>(2);

    if (bySourceAmount) {
        hops[0] = _tradeBNT(
            sourceToken,
            TokenType.BNT,
            true,
            amount,
            Constants.ONE,
            stakedBalance,
            tradingFeePPM,
            networkFeePPM,
            bntTradingLiquidity,
            tknTradingLiquidity
        );
        hops[1] = _tradeBNT(
            TokenType.BNT,
            targetToken,
            true,
            hops[0].targetAmount,
            limit,
            stakedBalance,
            tradingFeePPM,
            networkFeePPM,
            bntTradingLiquidity,
            tknTradingLiquidity
        );
    } else {
        hops[1] = _tradeBNT(
            targetToken,
            TokenType.BNT,
            false,
            amount,
            Constants.MAX_UINT256,
            stakedBalance,
            tradingFeePPM,
            networkFeePPM,
            bntTradingLiquidity,
            tknTradingLiquidity
        );
        hops[0] = _tradeBNT(
            TokenType.BNT,
            sourceToken,
            false,
            hops[1].sourceAmount,
            stakedBalance,
            limit,
            tradingFeePPM,
            networkFeePPM,
            bntTradingLiquidity,
            tknTradingLiquidity
        );
    }

    return hops;
}
