import Contracts from '../components/Contracts';
import { DeployedContracts, execute, getInstanceNameByAddress, getNamedSigners } from '../utils/Deploy';
import Logger from '../utils/Logger';
import { DEFAULT_DECIMALS, NATIVE_TOKEN_ADDRESS, TokenSymbol } from '../utils/TokenData';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { CoinGeckoClient } from 'coingecko-api-v3';
import Decimal from 'decimal.js';
import fs from 'fs';
import path from 'path';

interface EnvOptions {
    ENABLE_POOLS?: boolean;
}

const { ENABLE_POOLS: enablePools }: EnvOptions = process.env as any as EnvOptions;

interface TokenOverride {
    address: string;
    symbol?: string;
    decimals?: number;
}

const TOKEN_OVERRIDES: TokenOverride[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../data/token-overrides.json'), 'utf-8')
);

const MIN_STAKED_BALANCE_FACTOR = 2;

interface PoolData {
    address: string;
    bntVirtualBalance: Decimal;
    tokenVirtualBalance: Decimal;
}

const MAX_PRECISION = 16;

// provide a price override for an unknown token. For example:
//
// {
//    '0x1111111111111111111111111111111111111111': { usd: 12.34 }
// }
//
const UNKNOWN_TOKEN_PRICE_OVERRIDES: Record<string, Record<string, number>> = {};

const main = async () => {
    const { deployer } = await getNamedSigners();
    const bnt = await DeployedContracts.BNT.deployed();
    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();

    const allPools = await network.liquidityPools();

    const client = new CoinGeckoClient({
        timeout: 10000,
        autoRetry: true
    });

    /* eslint-disable camelcase */
    const tokenPrices = {
        ...Object.fromEntries(Object.entries(UNKNOWN_TOKEN_PRICE_OVERRIDES).map(([k, v]) => [k.toLowerCase(), v])),
        ...(await client.simpleTokenPrice({
            id: 'ethereum',
            contract_addresses: [bnt.address, ...allPools].join(','),
            vs_currencies: 'USD'
        }))
    };
    /* eslint-enable camelcase */

    const bntPrice = new Decimal(tokenPrices[bnt.address.toLowerCase()].usd);

    Logger.log();
    Logger.log('Looking for disabled pools...');

    const minLiquidityForTrading = await networkSettings.minLiquidityForTrading();

    const unknownTokens: Record<string, string> = {};

    const pools: Record<string, PoolData> = {};
    for (let i = 0; i < allPools.length; i++) {
        const pool = allPools[i];

        let symbol: string;
        let decimals: number;

        if (pool === NATIVE_TOKEN_ADDRESS) {
            symbol = TokenSymbol.ETH;
            decimals = DEFAULT_DECIMALS;
        } else {
            const tokenOverride = TOKEN_OVERRIDES.find((t) => t.address.toLowerCase() === pool.toLowerCase());
            const token = await Contracts.ERC20.attach(pool, deployer);
            symbol = tokenOverride?.symbol ?? (await token.symbol());
            decimals = tokenOverride?.decimals ?? (await token.decimals());
        }

        Logger.log();
        Logger.log(`Checking ${symbol} status [${pool}]...`);

        if (await networkInfo.tradingEnabled(pool)) {
            Logger.error('  Skipping already enabled pool...');

            continue;
        }

        const stakedBalance = new Decimal((await networkInfo.stakedBalance(pool)).toString());
        if (stakedBalance.isZero()) {
            Logger.error('  Skipping pool with no liquidity...');

            continue;
        }

        const tokenPriceData = tokenPrices[pool.toLowerCase()];
        if (!tokenPriceData) {
            unknownTokens[symbol] = pool;

            Logger.error('  Skipping unknown token');

            continue;
        }
        const tokenPrice = new Decimal(tokenPriceData.usd);
        const rate = bntPrice.div(tokenPrice);

        Logger.log(`  ${TokenSymbol.BNT} price: $${bntPrice.toFixed()}`);
        Logger.log(`  ${symbol} price: $${tokenPrice.toFixed()}`);
        Logger.log(`  ${symbol} to ${TokenSymbol.BNT} rate: ${rate.toFixed(MAX_PRECISION)}`);

        const tokenPriceNormalizationFactor = new Decimal(10).pow(DEFAULT_DECIMALS - decimals);

        if (decimals !== DEFAULT_DECIMALS) {
            Logger.log(`  ${symbol} decimals: ${decimals}`);
            Logger.log(
                `  ${symbol} to ${TokenSymbol.BNT} rate normalized: ${rate
                    .div(tokenPriceNormalizationFactor)
                    .toFixed(MAX_PRECISION)}`
            );
        }

        const fundingLimit = await networkSettings.poolFundingLimit(pool);
        if (fundingLimit.eq(0)) {
            Logger.error('  Skipping pool with insufficient funding limit');

            continue;
        }

        const estimatedRequiredLiquidity = new Decimal(minLiquidityForTrading.toString())
            .mul(rate)
            .mul(MIN_STAKED_BALANCE_FACTOR)
            .div(tokenPriceNormalizationFactor)
            .ceil();
        const decimalsFactor = new Decimal(10).pow(decimals);

        Logger.log(`  Current staked ${symbol} balance (wei): ${stakedBalance.toFixed()}`);
        Logger.log(`  Current staked ${symbol} balance: ${stakedBalance.div(decimalsFactor).toFixed(4)}`);
        Logger.log(`  Estimating minimum required ${symbol} liquidity (wei): ${estimatedRequiredLiquidity.toFixed()}`);
        Logger.log(
            `  Estimating minimum required ${symbol} liquidity: ${estimatedRequiredLiquidity
                .div(decimalsFactor)
                .toFixed(4)}`
        );

        if (stakedBalance.lt(estimatedRequiredLiquidity)) {
            Logger.error('  Skipping pool with insufficient liquidity');

            continue;
        }

        Logger.log(`  Found pending pool ${symbol} [${pool}]...`);

        const normalizedTokenPrice = tokenPrice.div(decimalsFactor);
        const normalizedBNTPrice = bntPrice.div(new Decimal(10).pow(DEFAULT_DECIMALS));

        const maxDecimals = Math.max(normalizedBNTPrice.decimalPlaces(), normalizedTokenPrice.decimalPlaces());
        const maxDecimalsFactor = new Decimal(10).pow(maxDecimals);
        const bntVirtualBalance = normalizedTokenPrice.mul(maxDecimalsFactor);
        const tokenVirtualBalance = normalizedBNTPrice.mul(maxDecimalsFactor);

        Logger.log(`  Suggested ${TokenSymbol.BNT} virtual balance: ${bntVirtualBalance.toFixed()}`);
        Logger.log(`  Suggested ${symbol} virtual balance: ${tokenVirtualBalance.toFixed()}`);

        if (enablePools) {
            const network = await DeployedContracts.BancorNetwork.deployed();
            const poolCollectionAddress = await network.collectionByPool(pool);

            await execute({
                name: getInstanceNameByAddress(poolCollectionAddress),
                methodName: 'enableTrading',
                args: [pool, bntVirtualBalance.toString(), tokenVirtualBalance.toString()],
                from: deployer.address
            });
        }

        pools[symbol] = {
            address: pool,
            bntVirtualBalance,
            tokenVirtualBalance
        };
    }

    Logger.log('');
    Logger.log('********************************************************************************');
    Logger.log('');

    const entries = Object.entries(pools);
    if (entries.length === 0) {
        Logger.log('Did not found any pending pools...');
        Logger.log();

        return;
    }

    Logger.log(`Found ${entries.length} pending pools:`);
    Logger.log();

    for (const [symbol, poolData] of entries) {
        Logger.log(`${symbol}:`);
        Logger.log(`  Pool: ${poolData.address}`);
        Logger.log(`  Suggested ${TokenSymbol.BNT} virtual balance: ${poolData.bntVirtualBalance.toFixed()}`);
        Logger.log(`  Suggested ${symbol} virtual balance: ${poolData.tokenVirtualBalance.toFixed()}`);
        Logger.log('');
    }

    Logger.log('********************************************************************************');
    Logger.log('');

    if (Object.keys(unknownTokens).length !== 0) {
        Logger.log('Unknown tokens:');

        for (const [symbol, address] of Object.entries(unknownTokens)) {
            Logger.log(`${symbol} - ${address}`);
        }

        Logger.log('');
    }
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        Logger.error(error);
        process.exit(1);
    });
