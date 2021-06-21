import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { saveSystem } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { defaultParam, getDefaultParams, taskOverride } from 'components/Tasks';
import { DeploymentConfig } from 'components/Types';

export type System = {};

export const deploySystem = async (
    signer: Signer,
    config: DeploymentConfig,
    overrides: taskOverride
): Promise<System> => {
    return {};
};

export default async (args: defaultParam, hre: HardhatRuntimeEnvironment) => {
    const { signer, config, overrides } = await getDefaultParams<DeploymentConfig>(hre, args);

    await saveSystem(await deploySystem(signer, config, overrides));
};
