import { DeployedContracts, execute, InstanceName, setDeploymentMetadata } from '../../utils/Deploy';
import { percentsToPPM, toWei } from '../../utils/Types';
import fs from 'fs';
import { DeployFunction } from 'hardhat-deploy/types';
import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { chunk } from 'lodash';
import path from 'path';

interface PoolConfig {
    symbol: string;
    address: string;
    fundingLimit: number;
    tradingFeePercents: number;
}

export const POOLS: PoolConfig[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../data/v3-launch-pools.json'), 'utf-8')
);

interface TokenOverride {
    address: string;
    symbol?: string;
    decimals?: number;
}

export const TOKEN_OVERRIDES: TokenOverride[] = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../data/v3-tokens-overrides.json'), 'utf-8')
);

const BATCH_SIZE = 20;

const func: DeployFunction = async ({ getNamedAccounts }: HardhatRuntimeEnvironment) => {
    const { deployer } = await getNamedAccounts();

    const poolCollection = await DeployedContracts.PoolCollectionType1V5.deployed();

    for (const { address, symbol, decimals } of TOKEN_OVERRIDES) {
        if (symbol) {
            await execute({
                name: InstanceName.PoolTokenFactory,
                methodName: 'setTokenSymbolOverride',
                args: [address, symbol],
                from: deployer
            });
        }

        if (decimals) {
            await execute({
                name: InstanceName.PoolTokenFactory,
                methodName: 'setTokenDecimalsOverride',
                args: [address, decimals],
                from: deployer
            });
        }
    }

    for (const batch of chunk(POOLS, BATCH_SIZE)) {
        const pools = batch.map((p) => p.address);
        const fundingLimits = batch.map((p) => toWei(p.fundingLimit));
        const tradingFeesPPM = batch.map((p) => ({
            address: p.address,
            tradingFeePPM: percentsToPPM(p.tradingFeePercents)
        }));

        await execute({
            name: InstanceName.NetworkSettings,
            methodName: 'addTokensToWhitelist',
            args: [pools],
            from: deployer
        });

        await execute({
            name: InstanceName.NetworkSettings,
            methodName: 'setFundingLimits',
            args: [pools, fundingLimits],
            from: deployer
        });

        await execute({
            name: InstanceName.BancorNetwork,
            methodName: 'createPools',
            args: [pools, poolCollection.address],
            from: deployer
        });

        const defaultTradingFeePPM = await poolCollection.defaultTradingFeePPM();

        for (const { address, tradingFeePPM } of tradingFeesPPM) {
            if (tradingFeePPM === defaultTradingFeePPM) {
                continue;
            }

            await execute({
                name: InstanceName.PoolCollectionType1V5,
                methodName: 'setTradingFeePPM',
                args: [address, tradingFeePPM],
                from: deployer
            });
        }
    }

    return true;
};

export default setDeploymentMetadata(__filename, func);
