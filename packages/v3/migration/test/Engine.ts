import { engine } from '../engine';
import { initEngine } from './helpers/Init';
import { expect } from 'chai';

describe('init engine', () => {
    beforeEach(async () => {
        await initEngine();
    });

    it('basic migration', async () => {
        const migration = (await import('./migrations/Basic')).default;

        expect(await engine.migrateOneUp(migration, 0, {}, {})).to.not.throw;
    });

    it('throwing migration', async () => {
        const migration = (await import('./migrations/Throw')).default;

        expect(await engine.migrateOneUp(migration, 0, {}, {})).to.throw;
    });
});
