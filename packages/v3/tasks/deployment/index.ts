import { types } from 'hardhat/config';
import { lazyAction, newDefaultTask } from 'components/Tasks';

newDefaultTask('deploy-system', 'Deploy a fresh system to a network from a deployment config file')
    .addParam('configPath', 'Deployment configuration file path', 'example.deployment.json', types.inputFile)
    .setAction(lazyAction('tasks/deployment/deploySystem.ts'));
