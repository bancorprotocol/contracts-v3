import { engine } from '../engine';
import { initEngine } from './helpers/Init';
import basicMigration from './migrations/Basic';
import throwingMigration from './migrations/Throw';
import { expect } from 'chai';

describe('init engine', () => {
    beforeEach(async () => {
        await initEngine();
    });

    it('basic migrate', async () => {
        expect(await engine.migrateOneUp(basicMigration, 0, {}, {})).to.not.throw;
    });

    it('throw migrate', async () => {
        expect(await engine.migrateOneUp(throwingMigration, 0, {}, {})).to.throw;
    });
});
