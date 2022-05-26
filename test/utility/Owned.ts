import Contracts, { TestOwned } from '../../components/Contracts';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('Owned', () => {
    let contract: TestOwned;

    let owner: SignerWithAddress;
    let nonOwner: SignerWithAddress;
    let newOwner: SignerWithAddress;

    before(async () => {
        [owner, nonOwner, newOwner] = await ethers.getSigners();
    });

    beforeEach(async () => {
        contract = await Contracts.TestOwned.deploy();
    });

    it('verifies the owner after construction', async () => {
        expect(await contract.owner()).to.equal(owner.address);
    });

    it('verifies the new owner after ownership transfer', async () => {
        await contract.transferOwnership(newOwner.address);
        await contract.connect(newOwner).acceptOwnership();

        expect(await contract.owner()).to.equal(newOwner.address);
    });

    it('verifies that ownership transfer fires an OwnerUpdate event', async () => {
        await contract.transferOwnership(newOwner.address);
        await expect(await contract.connect(newOwner).acceptOwnership())
            .to.emit(contract, 'OwnerUpdate')
            .withArgs(owner.address, newOwner.address);
    });

    it('verifies that newOwner is cleared after ownership transfer', async () => {
        await contract.transferOwnership(newOwner.address);
        await contract.connect(newOwner).acceptOwnership();

        expect(await contract.newOwner()).to.equal(ethers.constants.AddressZero);
    });

    it('verifies that no ownership transfer takes places before the new owner accepted it', async () => {
        await contract.transferOwnership(newOwner.address);

        expect(await contract.owner()).to.equal(owner.address);
    });

    it('verifies that only the owner can initiate ownership transfer', async () => {
        await expect(contract.connect(nonOwner).transferOwnership(newOwner.address)).to.be.revertedWithError(
            'AccessDenied'
        );
    });

    it('verifies that the owner can cancel ownership transfer before the new owner accepted it', async () => {
        await contract.transferOwnership(newOwner.address);
        await contract.transferOwnership(ethers.constants.AddressZero);

        expect(await contract.newOwner()).to.equal(ethers.constants.AddressZero);
    });

    it("verifies that it's not possible to transfer ownership to the same owner", async () => {
        await expect(contract.transferOwnership(owner.address)).to.be.revertedWithError('SameOwner');
    });
});
