import Contracts from '../components/Contracts';
import { DeployedContracts, getNamedSigners } from '../utils/Deploy';
import Logger from '../utils/Logger';
import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-etherscan';
import '@typechain/hardhat';
import fs from 'fs';
import hardhat from 'hardhat';
import path from 'path';

interface PoolTokenData {
    symbol: string;
    address: string;
    decimals: number;
    verified: boolean;
}

const POOL_TOKENS: Record<string, PoolTokenData> = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../data/pool-tokens.json'), 'utf-8')
);

const main = async () => {
    const { deployer } = await getNamedSigners();
    const network = await DeployedContracts.BancorNetwork.deployed();

    const allPools = await network.liquidityPools();

    Logger.log();
    Logger.log('Looking for unverified pool tokens...');

    for (let i = 0; i < allPools.length; i++) {
        const pool = allPools[i];

        if (POOL_TOKENS[pool]?.verified) {
            continue;
        }

        const poolCollection = await Contracts.PoolCollection.attach(await network.collectionByPool(pool), deployer);
        const address = await poolCollection.poolToken(pool);
        const poolToken = await Contracts.PoolToken.attach(address, deployer);

        const symbol = await poolToken.symbol();

        Logger.log();
        Logger.log(`Verifying ${symbol}...`);

        const name = await poolToken.name();
        const decimals = await poolToken.decimals();

        try {
            Logger.log('');

            await hardhat.run('verify:verify', {
                address,
                constructorArguments: [name, symbol, decimals, pool],
                quiet: true
            });
        } catch (e: any) {
            if (e.name === 'NomicLabsHardhatPluginError' && e.message === 'Contract source code already verified') {
                Logger.log(`  Pool token is already verified...`);
            }
        }

        POOL_TOKENS[pool] = {
            symbol,
            address,
            decimals,
            verified: true
        };

        fs.writeFileSync(
            path.resolve(__dirname, '../data/pool-tokens.json'),
            JSON.stringify(POOL_TOKENS, null, 2),
            'utf-8'
        );
    }

    Logger.log('');
    Logger.log('Finished');
};

main()
    .then(() => process.exit(0))
    .catch((error) => {
        Logger.error(error);
        process.exit(1);
    });
