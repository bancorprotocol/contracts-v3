import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { duration } from 'test/helpers/Time';
import { shouldHaveGap } from 'test/helpers/Proxy';
import { createPendingWithdrawals } from 'test/helpers/Factory';
import { PendingWithdrawals } from 'typechain';

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

    describe('lock duration', async () => {
        const newLockDuration = duration.days(1);
        let pendingWithdrawals: PendingWithdrawals;

        beforeEach(async () => {
            pendingWithdrawals = await createPendingWithdrawals();

            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
        });

        it('should revert when a non-owner attempts to set the lock duration', async () => {
            await expect(pendingWithdrawals.connect(nonOwner).setLockDuration(newLockDuration)).to.be.revertedWith(
                'ERR_ACCESS_DENIED'
            );
        });

        it('should be to able to set and update the lock duration', async () => {
            const res = await pendingWithdrawals.setLockDuration(newLockDuration);
            await expect(res)
                .to.emit(pendingWithdrawals, 'LockDurationUpdated')
                .withArgs(DEFAULT_LOCK_DURATION, newLockDuration);

            expect(await pendingWithdrawals.lockDuration()).to.equal(newLockDuration);

            const res2 = await pendingWithdrawals.setLockDuration(DEFAULT_LOCK_DURATION);
            await expect(res2)
                .to.emit(pendingWithdrawals, 'LockDurationUpdated')
                .withArgs(newLockDuration, DEFAULT_LOCK_DURATION);

            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
        });
    });

    describe('removal window duration', async () => {
        const newRemovalWindowDuration = duration.weeks(1);
        let pendingWithdrawals: PendingWithdrawals;

        beforeEach(async () => {
            pendingWithdrawals = await createPendingWithdrawals();

            expect(await pendingWithdrawals.removalWindowDuration()).to.equal(DEFAULT_REMOVAL_WINDOW_DURATION);
        });

        it('should revert when a non-owner attempts to set the removal window duration', async () => {
            await expect(
                pendingWithdrawals.connect(nonOwner).setRemovalWindowDuration(newRemovalWindowDuration)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be to able to set and update the removal window duration', async () => {
            const res = await pendingWithdrawals.setRemovalWindowDuration(newRemovalWindowDuration);
            await expect(res)
                .to.emit(pendingWithdrawals, 'RemovalWindowDurationUpdated')
                .withArgs(DEFAULT_REMOVAL_WINDOW_DURATION, newRemovalWindowDuration);

            expect(await pendingWithdrawals.removalWindowDuration()).to.equal(newRemovalWindowDuration);

            const res2 = await pendingWithdrawals.setRemovalWindowDuration(DEFAULT_REMOVAL_WINDOW_DURATION);
            await expect(res2)
                .to.emit(pendingWithdrawals, 'RemovalWindowDurationUpdated')
                .withArgs(newRemovalWindowDuration, DEFAULT_REMOVAL_WINDOW_DURATION);

            expect(await pendingWithdrawals.removalWindowDuration()).to.equal(DEFAULT_REMOVAL_WINDOW_DURATION);
        });
    });
});
