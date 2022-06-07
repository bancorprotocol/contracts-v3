import Contracts from '../components/Contracts';
import { DeployedContracts, getNamedSigners } from '../utils/Deploy';
import Logger from '../utils/Logger';
import { DEFAULT_DECIMALS, NATIVE_TOKEN_ADDRESS, TokenSymbol } from '../utils/TokenData';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import { CoinGeckoClient } from 'coingecko-api-v3';
import Decimal from 'decimal.js';
import fs from 'fs';
import path from 'path';

interface TokenOverride {
    address: string;
    symbol?: string;
    decimals?: number;
}

const TOKEN_OVERRIDES: TokenOverride[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../data/token-overrides.json'), 'utf-8')
);

const MIN_STAKED_BALANCE_FACTOR = 2;

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
    const tokenPrices = await client.simpleTokenPrice({
        id: 'ethereum',
        contract_addresses: [bnt.address, ...allPools].join(','),
        vs_currencies: 'USD'
    });
    /* eslint-enable camelcase */

    const bntPrice = new Decimal(tokenPrices[bnt.address.toLowerCase()].usd);

    Logger.log();
    Logger.log('Looking for disabled pools...');

    const minLiquidityForTrading = await networkSettings.minLiquidityForTrading();

    const unknownTokens: Record<string, string> = {};

    const pools: Record<string, string> = {};
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

        Logger.log(`  ${TokenSymbol.BNT} price: $${bntPrice.toFixed(4)}`);
        Logger.log(`  ${symbol} price: $${tokenPrice.toFixed(4)}`);
        Logger.log(`  ${symbol} to ${TokenSymbol.BNT} rate: ${rate.toFixed(4)}`);

        const rateNormalizationFactor = new Decimal(10).pow(DEFAULT_DECIMALS - decimals);
        const estimatedRequiredLiquidity = new Decimal(minLiquidityForTrading.toString())
            .mul(rate)
            .mul(MIN_STAKED_BALANCE_FACTOR)
            .div(rateNormalizationFactor)
            .ceil();
        const decimalsScale = new Decimal(10).pow(decimals);

        Logger.log(`  Current staked ${symbol} balance (wei): ${stakedBalance.toFixed()}`);
        Logger.log(`  Current staked ${symbol} balance: ${stakedBalance.div(decimalsScale).toFixed(4)}`);
        Logger.log(`  Estimating minimum required ${symbol} liquidity (wei): ${estimatedRequiredLiquidity.toFixed()}`);
        Logger.log(
            `  Estimating minimum required ${symbol} liquidity: ${estimatedRequiredLiquidity
                .div(decimalsScale)
                .toFixed(4)}`
        );

        if (stakedBalance.lt(estimatedRequiredLiquidity)) {
            Logger.error('  Skipping pool with insufficient liquidity');

            continue;
        }

        Logger.log(`  Found pending pool ${symbol} [${pool}]...`);

        pools[symbol] = pool;
    }

    Logger.log('');
    Logger.log('********************************************************************************');
    Logger.log('');

    const symbols = Object.keys(pools);
    if (symbols.length === 0) {
        Logger.log('Did not found any pending pools...');
        Logger.log();

        return;
    }

    Logger.log(`Found ${symbols.length} pending pools:`);
    Logger.log();

    for (const symbol of symbols) {
        Logger.log(`${symbol} - ${pools[symbol]}`);
    }

    Logger.log('');
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
