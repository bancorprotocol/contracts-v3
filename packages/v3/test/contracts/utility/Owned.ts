import { expect } from 'chai';
import { ethers } from 'hardhat';

import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
<<<<<<< HEAD:packages/v3/test/contracts/utility/Owned.ts
=======

import Contracts from 'components/Contracts';

>>>>>>> cc856fc74e07c9a65b087c48297db6d1ebfa239c:packages/v3/test/utility/Owned.ts
import { Owned } from 'typechain';

let contract: Owned;

let accounts: SignerWithAddress[];
let owner: SignerWithAddress;
let newOwner: SignerWithAddress;

describe('Owned', () => {
    before(async () => {
        accounts = await ethers.getSigners();

        owner = accounts[0];
        newOwner = accounts[1];
    });

    beforeEach(async () => {
        contract = await Contracts.Owned.deploy();
    });

    it('verifies the owner after construction', async () => {
        expect(await contract.owner()).to.equal(accounts[0].address);
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
        const nonOwner = accounts[2];

        await expect(contract.connect(nonOwner).transferOwnership(newOwner.address)).to.be.revertedWith(
            'ERR_ACCESS_DENIED'
        );
    });

    it('verifies that the owner can cancel ownership transfer before the new owner accepted it', async () => {
        await contract.transferOwnership(newOwner.address);
        await contract.transferOwnership(ethers.constants.AddressZero);

        expect(await contract.newOwner()).to.equal(ethers.constants.AddressZero);
    });

    it("verifies that it's not possible to transfer ownership to the same owner", async () => {
        await expect(contract.transferOwnership(owner.address)).to.be.revertedWith('ERR_SAME_OWNER');
    });
});
