import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { duration } from 'test/helpers/Time';
import { shouldHaveGap } from 'test/helpers/Proxy';
import { createPendingWithdrawals } from 'test/helpers/Factory';

const DEFAULT_LOCK_DURATION = duration.days(7);
const DEFAULT_REMOVAL_WINDOW_DURATION = duration.days(3);

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;

describe('PendingWithdrawals', () => {
    shouldHaveGap('PendingWithdrawals', '_positions');

    before(async () => {
        accounts = await ethers.getSigners();

        [, nonOwner] = accounts;
    });

    describe('construction', async () => {
        it('should revert when attempting to reinitialize', async () => {
            const pendingWithdrawals = await createPendingWithdrawals();

            await expect(pendingWithdrawals.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            const pendingWithdrawals = await createPendingWithdrawals();

            expect(await pendingWithdrawals.version()).to.equal(1);

            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
            expect(await pendingWithdrawals.removalWindowDuration()).to.equal(DEFAULT_REMOVAL_WINDOW_DURATION);
        });
    });
});
