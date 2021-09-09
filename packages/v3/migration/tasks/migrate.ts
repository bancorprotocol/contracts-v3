import { engine } from '../../migration/engine';

export default async () => {
    await engine.migrate();
};
