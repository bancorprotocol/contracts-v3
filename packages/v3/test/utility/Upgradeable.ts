import Contracts from '../../components/Contracts';
import { TestUpgradeable } from '../../typechain-types';
import { expectRole, expectRoles, Roles } from '../helpers/AccessControl';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Upgradeable', () => {
    let upgradeable: TestUpgradeable;

    let deployer: SignerWithAddress;
    let nonOwner: SignerWithAddress;

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
        await expectRoles(upgradeable, Roles.Upgradeable);

        await expectRole(upgradeable, Roles.Upgradeable.ROLE_ADMIN, Roles.Upgradeable.ROLE_ADMIN, [deployer.address]);
    });

    it('should revert when a non-owner is attempting to call a restricted function', async () => {
        await expect(upgradeable.connect(nonOwner).restricted()).to.be.revertedWith('AccessDenied');
    });
});
