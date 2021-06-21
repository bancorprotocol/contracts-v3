import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploy, execute, saveSystem } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { getDefaultParams, taskOverride } from 'components/Tasks';
import { System } from 'components/Types';
import { createPoolArgs } from '.';

export const createPool = async (signer: Signer, config: System, overrides: taskOverride, poolId: string) => {
    // @TODO
    return config;
};

export default async (args: createPoolArgs, hre: HardhatRuntimeEnvironment) => {
    const { signer, config, overrides } = await getDefaultParams<System>(hre, args);

    await saveSystem(await createPool(signer, config, overrides, args.poolId));
};
