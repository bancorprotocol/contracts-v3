import { migrateParamTask } from '..';
import { engine } from '../engine';
import { HardhatRuntimeEnvironment } from 'hardhat/types';

export default async (args: migrateParamTask, hre: HardhatRuntimeEnvironment) => {
    if (args.reset) {
        engine.resetIO();
    }
    await engine.migrate();
};
