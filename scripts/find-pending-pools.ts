import Contracts from '../components/Contracts';
import { DeployedContracts } from '../utils/Deploy';
import Logger from '../utils/Logger';
import { DEFAULT_DECIMALS, NATIVE_TOKEN_ADDRESS, TokenSymbol } from '../utils/TokenData';
import '@nomiclabs/hardhat-ethers';
import '@typechain/hardhat';
import axios from 'axios';
import Decimal from 'decimal.js';
import fs from 'fs';
import path from 'path';

interface EnvOptions {
    CRYPTOCOMPARE_API_KEY: string;
}

const { CRYPTOCOMPARE_API_KEY }: EnvOptions = process.env as any as EnvOptions;
const CRYPTOCOMPARE_API = 'https://min-api.cryptocompare.com/data/price';

interface TokenOverride {
    address: string;
    symbol?: string;
    decimals?: number;
}

const TOKEN_OVERRIDES: TokenOverride[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../data/token-overrides.json'), 'utf-8')
);

const LOCAL_TOKEN_SYMBOL_OVERRIDES: Record<string, string> = {
    '0xd5cd84d6f044abe314ee7e414d37cae8773ef9d3': 'ONE'
};

const MIN_STAKED_BALANCE_FACTOR = 2;

const main = async () => {
    const network = await DeployedContracts.BancorNetwork.deployed();
    const networkInfo = await DeployedContracts.BancorNetworkInfo.deployed();
    const networkSettings = await DeployedContracts.NetworkSettings.deployed();

    Logger.log();
    Logger.log('Looking for disabled pools...');

    const allPools = await network.liquidityPools();
    const minLiquidityForTrading = await networkSettings.minLiquidityForTrading();

    const pools: Record<string, string> = {};
    for (let i = 0; i < allPools.length; i++) {
        const pool = allPools[i];
        let symbol: string;
        let decimals: number;

        if (pool === NATIVE_TOKEN_ADDRESS) {
            symbol = TokenSymbol.ETH;
            decimals = DEFAULT_DECIMALS;
        } else {
            const localSymbolOverride = LOCAL_TOKEN_SYMBOL_OVERRIDES[pool.toLowerCase()];
            const tokenOverride = TOKEN_OVERRIDES.find((t) => t.address.toLowerCase() === pool.toLowerCase());
            const token = await Contracts.ERC20.attach(pool);
            symbol = localSymbolOverride ?? tokenOverride?.symbol ?? (await token.symbol());
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

        const res = await axios.get(CRYPTOCOMPARE_API, {
            params: {
                fsym: TokenSymbol.BNT,
                tsyms: symbol
            },
            headers: {
                Apikey: CRYPTOCOMPARE_API_KEY
            }
        });

        const rate = res.data[symbol];
        if (!rate) {
            Logger.error('  Skipping unknown token');

            continue;
        }

        Logger.log(`  ${symbol} to ${TokenSymbol.BNT} rate: ${rate}`);

        const rateScale = new Decimal(10).pow(DEFAULT_DECIMALS - decimals);
        const estimatedRequiredLiquidity = new Decimal(minLiquidityForTrading.toString())
            .mul(rate)
            .mul(MIN_STAKED_BALANCE_FACTOR)
            .div(rateScale);
        const decimalsScale = new Decimal(10).pow(decimals);

        Logger.log(`  Current staked ${symbol} balance (wei): ${stakedBalance.toFixed()}`);
        Logger.log(`  Current staked ${symbol} balance: ${stakedBalance.div(decimalsScale).toFixed()}`);
        Logger.log(`  Estimating minimum required ${symbol} liquidity (wei): ${estimatedRequiredLiquidity.toFixed()}`);
        Logger.log(
            `  Estimating minimum required ${symbol} liquidity: ${estimatedRequiredLiquidity
                .div(decimalsScale)
                .toFixed()}`
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
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        Logger.error(error);
        process.exit(1);
    });
