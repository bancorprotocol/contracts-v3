import Contracts, { TestUpgradeable } from '../../components/Contracts';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { shouldHaveGap } from '../helpers/Proxy';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Upgradeable', () => {
    let upgradeable: TestUpgradeable;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

    shouldHaveGap('Upgradeable', '_versionCount');

    before(async () => {
        [deployer, nonOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        upgradeable = await Contracts.TestUpgradeable.deploy();

        await upgradeable.initialize();
    });

    it('should revert when attempting to reinitialize', async () => {
        await expect(upgradeable.initialize()).to.be.revertedWith('Initializable: contract is already initialized');
    });

    it('should be properly initialized', async () => {
        expect(await upgradeable.version()).to.equal(1);
        expect(await upgradeable.versionCount()).to.equal(1);

        await expectRoles(upgradeable, Roles.Upgradeable);

        await expectRole(upgradeable, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer.address]);
    });

    it('should revert when a non-owner is attempting to call a restricted function', async () => {
        await expect(upgradeable.connect(nonOwner).restricted()).to.be.revertedWith('AccessDenied');
    });
});
