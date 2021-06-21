import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { saveSystem } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { defaultParam, getDefaultParams, taskOverride } from 'components/Tasks';
import { System } from './deploy';

export type NewSystem = {};

export const migrateSystem = async (signer: Signer, config: System, overrides: taskOverride): Promise<NewSystem> => {
    return {
        // @TODO when first migration
    };
};

export default async (args: defaultParam, hre: HardhatRuntimeEnvironment) => {
    const { signer, config, overrides } = await getDefaultParams<System>(hre, args);

    await saveSystem(await migrateSystem(signer, config, overrides));
};
