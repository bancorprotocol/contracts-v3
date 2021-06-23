import { HardhatRuntimeEnvironment } from 'hardhat/types';
import { saveSystem, deploy } from '../utils';
import { Signer } from '@ethersproject/abstract-signer';
import { defaultParam, getDefaultParamsWithConfig, taskOverride } from 'components/Tasks';
import Contracts from 'components/Contracts';
import { NewSystem, System } from 'components/Types';

export const migrateSystem = async (signer: Signer, config: System, overrides: taskOverride): Promise<NewSystem> => {
    const tokenHolder1 = await Contracts.Owned.deploy(overrides);

    return {
        tokenHolder: config.tokenHolder,
        tokenHolder1: {
            address: tokenHolder1.address,
            tx: tokenHolder1.deployTransaction.hash
        }
    };
};

export default async (args: defaultParam, hre: HardhatRuntimeEnvironment) => {
    const { signer, config, overrides } = await getDefaultParamsWithConfig<System>(hre, args);

    await saveSystem(await migrateSystem(signer, config, overrides));
};
