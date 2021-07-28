import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Contracts from '../../components/Contracts';
import { duration } from '../helpers/Time';
import { ZERO_ADDRESS } from '../helpers/Constants';
import { shouldHaveGap } from '../helpers/Proxy';
import { createSystem } from '../helpers/Factory';
import { PendingWithdrawals } from '../../typechain';

const DEFAULT_LOCK_DURATION = duration.days(7);
const DEFAULT_WITHDRAWAL_WINDOW_DURATION = duration.days(3);

let accounts: SignerWithAddress[];
let nonOwner: SignerWithAddress;
let dummy: SignerWithAddress;

describe('PendingWithdrawals', () => {
    shouldHaveGap('PendingWithdrawals', '_positions');

    before(async () => {
        [, nonOwner, dummy] = await ethers.getSigners();
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            const { pendingWithdrawals } = await createSystem();

            await expect(pendingWithdrawals.initialize()).to.be.revertedWith(
                'Initializable: contract is already initialized'
            );
        });

        it('should revert when initialized with an invalid network contract', async () => {
            await expect(Contracts.PendingWithdrawals.deploy(ZERO_ADDRESS, dummy.address)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should revert when initialized with an invalid network token pool contract', async () => {
            await expect(Contracts.PendingWithdrawals.deploy(dummy.address, ZERO_ADDRESS)).to.be.revertedWith(
                'ERR_INVALID_ADDRESS'
            );
        });

        it('should be properly initialized', async () => {
            const { pendingWithdrawals, network, networkTokenPool } = await createSystem();

            expect(await pendingWithdrawals.version()).to.equal(1);

            expect(await pendingWithdrawals.network()).to.equal(network.address);
            expect(await pendingWithdrawals.networkTokenPool()).to.equal(networkTokenPool.address);
            expect(await pendingWithdrawals.lockDuration()).to.equal(DEFAULT_LOCK_DURATION);
            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
        });
    });

    describe('lock duration', () => {
        const newLockDuration = duration.days(1);
        let pendingWithdrawals: PendingWithdrawals;

        beforeEach(async () => {
            ({ pendingWithdrawals } = await createSystem());

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

    describe('withdrawal window duration', () => {
        const newWithdrawalWindowDuration = duration.weeks(2);
        let pendingWithdrawals: PendingWithdrawals;

        beforeEach(async () => {
            ({ pendingWithdrawals } = await createSystem());

            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
        });

        it('should revert when a non-owner attempts to set the withdrawal window duration', async () => {
            await expect(
                pendingWithdrawals.connect(nonOwner).setWithdrawalWindowDuration(newWithdrawalWindowDuration)
            ).to.be.revertedWith('ERR_ACCESS_DENIED');
        });

        it('should be to able to set and update the withdrawal window duration', async () => {
            const res = await pendingWithdrawals.setWithdrawalWindowDuration(newWithdrawalWindowDuration);
            await expect(res)
                .to.emit(pendingWithdrawals, 'WithdrawalWindowDurationUpdated')
                .withArgs(DEFAULT_WITHDRAWAL_WINDOW_DURATION, newWithdrawalWindowDuration);

            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(newWithdrawalWindowDuration);

            const res2 = await pendingWithdrawals.setWithdrawalWindowDuration(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
            await expect(res2)
                .to.emit(pendingWithdrawals, 'WithdrawalWindowDurationUpdated')
                .withArgs(newWithdrawalWindowDuration, DEFAULT_WITHDRAWAL_WINDOW_DURATION);

            expect(await pendingWithdrawals.withdrawalWindowDuration()).to.equal(DEFAULT_WITHDRAWAL_WINDOW_DURATION);
        });
    });
});
