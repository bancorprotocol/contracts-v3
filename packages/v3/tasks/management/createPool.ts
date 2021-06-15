import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { loadConfig, advancedDeploy, advancedExecute } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { defaultParam, getDefaultParams, taskOverride } from 'components/Tasks';
import { SystemConfig } from 'components/Types';

export const createPool = async (
    signer: Signer,
    config: SystemConfig,
    overrides: taskOverride,
    deploy = advancedDeploy,
    execute = advancedExecute
) => {};

export default async (
    args: defaultParam & {
        configPath: string;
    },
    hre: HardhatRuntimeEnvironment
) => {
    const { signer, gasPrice } = await getDefaultParams(hre, args);
    const config = await loadConfig(args.configPath);
};
