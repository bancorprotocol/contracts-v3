import Contracts from '../../components/Contracts';
import { TestUpgradeable } from '../../typechain';
import { expectRole, roles } from '../helpers/AccessControl';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

const { Upgradeable: UpgradeableRoles } = roles;

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
        await expectRole(upgradeable, UpgradeableRoles.ROLE_OWNER, UpgradeableRoles.ROLE_OWNER, [deployer.address]);
    });

    it('should revert when a non-owner is attempting to call a restricted function', async () => {
        await expect(upgradeable.connect(nonOwner).restricted()).to.be.revertedWith(Errors.AccessDenied());
    });
});
