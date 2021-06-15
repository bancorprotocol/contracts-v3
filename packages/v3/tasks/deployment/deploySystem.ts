import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { loadConfig, advancedDeploy, advancedExecute } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { defaultParam, getDefaultParams, taskOverride } from 'components/Tasks';
import { DeploymentConfig } from 'components/Types';

export const deploySystem = async (
    signer: Signer,
    config: DeploymentConfig,
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
