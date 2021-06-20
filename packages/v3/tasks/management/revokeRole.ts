import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploy, execute } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { defaultParam, getDefaultParams, taskOverride } from 'components/Tasks';
import { SystemConfig } from 'components/Types';

export const revokeRole = async (signer: Signer, config: SystemConfig, overrides: taskOverride) => {};

export default async (args: defaultParam, hre: HardhatRuntimeEnvironment) => {
    const { signer, config, overrides } = await getDefaultParams<SystemConfig>(hre, args);

    await revokeRole(signer, config, overrides);
};
