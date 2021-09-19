import { engine } from '../engine';

export default async () => {
    await engine.migrate();
};
