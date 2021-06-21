import { lazyAction, newDefaultTask } from 'components/Tasks';

newDefaultTask('deploy', 'Deploy a new system').setAction(lazyAction('tasks/migration/deploy.ts'));

newDefaultTask('migrate', 'Migrate to a new system').setAction(lazyAction('tasks/migration/migrate.ts'));
