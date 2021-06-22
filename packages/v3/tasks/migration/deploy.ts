import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { saveSystem, deploy, execute, startExecutionLog } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { defaultParam, executionConfig, getDefaultParamsWithConfig, taskOverride } from 'components/Tasks';
import { DeploymentConfig, System } from 'components/Types';
import Contracts from 'components/Contracts';
import { createPool } from 'tasks/management/createPool';
import { ethers } from 'hardhat';

export const deploySystem = async (
    signer: Signer,
    executionConfig: executionConfig,
    config: DeploymentConfig,
    overrides: taskOverride
): Promise<System> => {
    const tokenHolder = await deploy('tokenHolder', executionConfig, Contracts.TokenHolder.deploy);

    const pool = await createPool(signer, '122', overrides);

    await execute(
        'transfer of ownership',
        executionConfig,
        tokenHolder.transferOwnership,
        (
            await ethers.getSigners()
        )[1].address
    );

    return {
        tokenHolder: { address: tokenHolder.address, tx: tokenHolder.deployTransaction.hash }
    };
};

export default async (args: defaultParam, hre: HardhatRuntimeEnvironment) => {
    startExecutionLog('deploySystem');

    const { signer, executionConfig, config, overrides } = await getDefaultParamsWithConfig<DeploymentConfig>(
        hre,
        args,
        true
    );

    await saveSystem(await deploySystem(signer, executionConfig, config, overrides), true);
};
