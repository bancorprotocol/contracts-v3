import { Signer } from '@ethersproject/abstract-signer';
import { taskOverride } from 'components/Tasks';
import { DeploymentConfig } from 'components/Types';

export type OldSystem = {};

export const deployOldSystem = async (
    signer: Signer,
    config: DeploymentConfig,
    overrides: taskOverride
): Promise<OldSystem> => {
    return {};
};
