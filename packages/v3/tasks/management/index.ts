import { defaultParam, lazyAction, newDefaultTask } from 'components/Tasks';

///////////
// Pools //
///////////

// Create
export type createPoolArgs = defaultParam & {
    poolId: string;
};
newDefaultTask('createPool', 'Create a liquidity pool')
    .addParam('poolId', 'The pool identification number')
    .setAction(lazyAction('tasks/management/createPool.ts'));
