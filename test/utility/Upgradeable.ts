import Contracts, { TestUpgradeable } from '../../components/Contracts';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Upgradeable', () => {
    let admin: SignerWithAddress;
    let nonAdmin: SignerWithAddress;

    let upgradeable: TestUpgradeable;

    shouldHaveGap('Upgradeable', '_initializations');

    before(async () => {
        [admin, nonAdmin] = await ethers.getSigners();
    });

    beforeEach(async () => {
        upgradeable = await Contracts.TestUpgradeable.deploy();

        await upgradeable.initialize();
    });

    describe('construction', () => {
        it('should revert when attempting to reinitialize', async () => {
            await expect(upgradeable.initialize()).to.be.revertedWithError(
                'Initializable: contract is already initialized'
            );
        });

        it('should be properly initialized', async () => {
            expect(await upgradeable.version()).to.equal(1);
            expect(await upgradeable.initializations()).to.equal(1);

            await expectRoles(upgradeable, Roles.Upgradeable);

            await expectRole(upgradeable, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [admin.address]);
        });

        it('should revert when a non-admin is attempting to call a restricted function', async () => {
            await expect(upgradeable.connect(nonAdmin).restricted()).to.be.revertedWithError('AccessDenied');
        });
    });

    describe('upgrade callbacks', () => {
        context('incremented version', () => {
            beforeEach(async () => {
                await upgradeable.setVersion((await upgradeable.version()) + 1);
            });

            it('should allow executing the post-upgrade callback', async () => {
                await expect(upgradeable.postUpgrade([])).not.to.be.reverted;

                await upgradeable.setVersion((await upgradeable.version()) + 1);

                await expect(upgradeable.postUpgrade([])).not.to.be.reverted;
            });

            it('should not allow executing the post-upgrade callback twice per-version', async () => {
                await expect(upgradeable.postUpgrade([])).not.to.be.reverted;
                await expect(upgradeable.postUpgrade([])).to.be.revertedWithError('AlreadyInitialized');
            });
        });

        context('wrong version', () => {
            for (const diff of [0, 10]) {
                context(`diff ${diff}`, () => {
                    beforeEach(async () => {
                        await upgradeable.setVersion((await upgradeable.version()) + diff);
                    });
                });

                it('should revert when attempting to execute the post-upgrade callback', async () => {
                    await expect(upgradeable.postUpgrade([])).to.be.revertedWithError('AlreadyInitialized');
                });
            }
        });
    });
});
