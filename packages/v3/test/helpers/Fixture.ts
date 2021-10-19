import { waffle } from 'hardhat';

export function prepare(this: any, fn: Mocha.AsyncFunc) {
    before(async () => {
        await waffle.loadFixture(async () => {
            await fn.apply(this);
        });
    });
}
export function prepareEach(this: any, fn: Mocha.AsyncFunc) {
    beforeEach(async () => {
        await waffle.loadFixture(async () => {
            await fn.apply(this);
        });
    });
}
