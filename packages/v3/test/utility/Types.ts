import Contracts, { TestTypes } from '../../components/Contracts';
import { ZERO_FRACTION } from '../../utils/Constants';
import { toString } from '../../utils/Types';
import { expect } from 'chai';

describe('Types', () => {
    let types: TestTypes;

    before(async () => {
        types = await Contracts.TestTypes.deploy();
    });

    describe('isFractionValid', () => {
        for (const fraction of [
            { n: 0, d: 1 },
            { n: 1, d: 2 },
            { n: 1000, d: 2000 }
        ]) {
            it(`should return that ${toString(fraction)} is valid`, async () => {
                expect(await types.isFractionValid(fraction)).to.be.true;
            });
        }

        for (const fraction of [
            { n: 0, d: 0 },
            { n: 1, d: 0 },
            { n: 1000, d: 0 }
        ]) {
            it(`should return that ${fraction} is invalid`, async () => {
                expect(await types.isFractionValid(fraction)).to.be.false;
            });
        }
    });

    describe('isFractionZero', () => {
        for (const fraction of [
            { n: 0, d: 1 },
            { n: 0, d: 1000 }
        ]) {
            it(`should return that ${toString(fraction)} is zero`, async () => {
                expect(await types.isFractionZero(fraction)).to.be.true;
            });
        }

        for (const fraction of [
            { n: 1, d: 1 },
            { n: 1, d: 2 },
            { n: 1000, d: 2000 },

            // invalid fractions aren't zero
            { n: 0, d: 0 },
            { n: 1, d: 0 }
        ]) {
            it(`should return that ${toString(fraction)} is not zero`, async () => {
                expect(await types.isFractionZero(fraction)).to.be.false;
            });
        }
    });

    describe('zeroFraction', () => {
        it('should return the zero fraction', async () => {
            const zeroFraction = await types.zeroFraction();
            expect(zeroFraction).to.equal(ZERO_FRACTION);
        });
    });
});
