import { types } from 'hardhat/config';
import { lazyAction, newDefaultTask } from 'components/Tasks';

newDefaultTask('createPool', 'Create a liquidity pool')
    .addParam('configPath', 'System configuration file path', 'example.system.json', types.inputFile)
    .setAction(lazyAction('tasks/management/createPool.ts'));
