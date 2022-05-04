import Contracts from '../components/Contracts';
import { getBalance } from '../test/helpers/Utils';
import { DeployedContracts, isTenderlyFork } from '../utils/Deploy';
import { NATIVE_TOKEN_ADDRESS } from '../utils/TokenData';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import Decimal from 'decimal.js';
import { BigNumber } from 'ethers';
import fs from 'fs';
import { ethers, getNamedAccounts } from 'hardhat';
import 'hardhat-deploy';

interface PoolStats {
    symbol: string;
    bntTradingLiquidity: BigNumber;
    tknTradingLiquidity: BigNumber;
    stakedBalance: BigNumber;
    depositLimit: BigNumber;
    tradingFeePPM: number;
    depositingEnabled: boolean;
    tradingEnabled: boolean;
    spotRate: Decimal;
    emaRate: Decimal;
    emaBlockNumber: number;
    emaCompressedNumerator: BigNumber;
    emaCompressedDenominator: BigNumber;
    masterVaultTknBalance: BigNumber;
    externalProtectionVaultTknBalance: BigNumber;
    bntFundingLimit: BigNumber;
    bntRemainingFunding: BigNumber;
    bntFundingAmount: BigNumber;
    bnTkn: string;
    bnTknTotalSupply: BigNumber;
}

interface GlobalStats {
    blockNumber: number;
    masterVaultBntBalance: BigNumber;
    bntPoolBntBalance: BigNumber;
    bntPoolStakedAmount: BigNumber;
    vortexBntBalance: BigNumber;
    networkFeePPM: number;
    minLiquidityForTrading: BigNumber;
    lockDuration: number;
    bnBntTotalSupply: BigNumber;
}

const gcd = (x: BigNumber, y: BigNumber) => {
    while (y.gt(0)) {
        const t = y;
        y = x.mod(y);
        x = t;
    }

    return x;
};

const saveCSV = (data: Record<string, any>[], outputPath: string) => {
    const headers = Object.keys(data[0]);
    const rows = data
        .map((p) =>
            Object.values(p)
                .map((v) => v.toString())
                .join(',')
        )
        .join('\n');

    fs.writeFileSync(outputPath, [headers, rows].join('\n'), 'utf-8');
};

const saveGlobalStats = async () => {
    const bnt = await DeployedContracts.BNT.deployed();

    const network = await DeployedContracts.BancorNetwork.deployed();
    const settings = await DeployedContracts.NetworkSettings.deployed();
    const pendingWithdrawals = await DeployedContracts.PendingWithdrawals.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const bnBNT = await DeployedContracts.bnBNT.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();

    const stats: GlobalStats = {
        blockNumber: await ethers.provider.getBlockNumber(),
        masterVaultBntBalance: await bnt.balanceOf(masterVault.address),
        bntPoolBntBalance: await bnt.balanceOf(bntPool.address),
        bntPoolStakedAmount: await bntPool.stakedBalance(),
        vortexBntBalance: await network.pendingNetworkFeeAmount(),
        networkFeePPM: await settings.networkFeePPM(),
        minLiquidityForTrading: await settings.minLiquidityForTrading(),
        lockDuration: await pendingWithdrawals.lockDuration(),
        bnBntTotalSupply: await bnBNT.totalSupply()
    };

    saveCSV([stats], `./global.csv`);
};

const savePoolStats = async () => {
    const { dai, link } = await getNamedAccounts();

    const pools = {
        ETH: NATIVE_TOKEN_ADDRESS,
        LINK: link,
        DAI: dai
    };

    const settings = await DeployedContracts.NetworkSettings.deployed();
    const poolCollection = await DeployedContracts.PoolCollectionType1V1.deployed();
    const bntPool = await DeployedContracts.BNTPool.deployed();
    const masterVault = await DeployedContracts.MasterVault.deployed();
    const externalProtectionVault = await DeployedContracts.ExternalProtectionVault.deployed();

    const poolStats: PoolStats[] = [];

    for (const [symbol, pool] of Object.entries(pools)) {
        const token = { address: pool };
        const poolData = await poolCollection.poolData(pool);
        const { liquidity, averageRate } = poolData;
        const emaGCD = gcd(averageRate.rate.n, averageRate.rate.d);
        const poolToken = await Contracts.PoolToken.attach(poolData.poolToken);

        poolStats.push({
            symbol,
            bntTradingLiquidity: liquidity.bntTradingLiquidity,
            tknTradingLiquidity: liquidity.baseTokenTradingLiquidity,
            stakedBalance: liquidity.stakedBalance,
            depositLimit: poolData.depositLimit,
            tradingFeePPM: poolData.tradingFeePPM,
            depositingEnabled: poolData.depositingEnabled,
            tradingEnabled: poolData.tradingEnabled,
            spotRate: new Decimal(liquidity.bntTradingLiquidity.toString()).div(
                new Decimal(liquidity.baseTokenTradingLiquidity.toString())
            ),
            emaRate: new Decimal(averageRate.rate.n.toString()).div(new Decimal(averageRate.rate.d.toString())),
            emaBlockNumber: averageRate.blockNumber,
            emaCompressedNumerator: averageRate.rate.n.div(emaGCD),
            emaCompressedDenominator: averageRate.rate.d.div(emaGCD),
            masterVaultTknBalance: await getBalance(token, masterVault),
            externalProtectionVaultTknBalance: await getBalance(token, externalProtectionVault),
            bntFundingLimit: await settings.poolFundingLimit(pool),
            bntRemainingFunding: await bntPool.availableFunding(pool),
            bntFundingAmount: await bntPool.currentPoolFunding(pool),
            bnTkn: poolData.poolToken,
            bnTknTotalSupply: await poolToken.totalSupply()
        });
    }

    saveCSV(poolStats, `./pools.csv`);
};

const main = async () => {
    if (!isTenderlyFork()) {
        throw new Error('Invalid network');
    }

    await saveGlobalStats();
    await savePoolStats();
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
