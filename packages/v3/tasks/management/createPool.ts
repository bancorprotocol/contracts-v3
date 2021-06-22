import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { saveSystem } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { getDefaultParamsWithConfig, taskOverride } from 'components/Tasks';
import { createPoolArgs } from '.';
import { System } from 'components/Types';

export const createPool = async (signer: Signer, poolId: string, overrides: taskOverride) => {
    console.log(`Creating pool: { ID: ${poolId} }`);

    // Do something

    return {};
};

export default async (args: createPoolArgs, hre: HardhatRuntimeEnvironment) => {
    const { signer, config, overrides } = await getDefaultParamsWithConfig<System>(hre, args);

    const pool = await createPool(signer, args.poolId, overrides);

    // config.pools.add(pool);

    await saveSystem(config);
};
