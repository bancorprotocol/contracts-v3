import { types } from 'hardhat/config';
import { lazyAction, newDefaultTask } from 'components/Tasks';

///////////
// Pools //
///////////

// Create
newDefaultTask('createPool', 'Create a liquidity pool')
    .addParam('poolId', 'The pool identification number')
    .setAction(lazyAction('tasks/management/createPool.ts'));

// Remove
newDefaultTask('removePool', 'Remove a liquidity pool')
    .addParam('configPath', 'System configuration file path', 'example.system.json', types.inputFile)
    .setAction(lazyAction('tasks/management/removePool.ts'));

///////////
// Roles //
///////////

///// Give
newDefaultTask('giveRole', 'Give a role to a contract')
    .addParam('configPath', 'System configuration file path', 'example.system.json', types.inputFile)
    .setAction(lazyAction('tasks/management/giveRole.ts'));

///// Revoke
newDefaultTask('revokeRole', 'Remoke a role from a contract')
    .addParam('configPath', 'System configuration file path', 'example.system.json', types.inputFile)
    .setAction(lazyAction('tasks/management/revokeRole.ts'));
