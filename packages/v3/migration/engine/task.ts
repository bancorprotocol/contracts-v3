import { lazyAction, newDefaultTask } from 'components/Tasks';

newDefaultTask('migrate', '').setAction(lazyAction('migration/engine/migrate.ts'));
