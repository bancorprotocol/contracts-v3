import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { deploy, execute } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { defaultParam, getDefaultParams, taskOverride } from 'components/Tasks';
import { DeploymentConfig, SystemConfig } from 'components/Types';
import Contracts from 'components/Contracts';

export const deploySystem = async (
    signer: Signer,
    config: DeploymentConfig,
    overrides: taskOverride
): Promise<SystemConfig> => {
    const tokenHolder = await deploy('tokenHolder', Contracts.TokenHolder.deploy());



    return {
        tokenHolder: {
            address: tokenHolder.address,
            roles: 
        }
    };
};

export default async (args: defaultParam, hre: HardhatRuntimeEnvironment) => {
    const { signer, config, overrides } = await getDefaultParams<DeploymentConfig>(hre, args);

    await deploySystem(signer, config, overrides);
};
