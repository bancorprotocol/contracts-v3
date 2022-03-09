import Contracts, { TestERC20Token, TestSafeERC20Ex } from '../../components/Contracts';
import { createTestToken } from '../helpers/Factory';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('SafeERC20Ex', () => {
    let safeERC20: TestSafeERC20Ex;
    let token: TestERC20Token;

    let deployer: SignerWithAddress;
    let spender: SignerWithAddress;
    let sender: string;

    before(async () => {
        [deployer, spender] = await ethers.getSigners();
    });

    beforeEach(async () => {
        safeERC20 = await Contracts.TestSafeERC20Ex.deploy();
        sender = safeERC20.address;

        token = await createTestToken();

        await token.transfer(safeERC20.address, (await token.balanceOf(deployer.address)).div(2));
    });

    it('should set allowance', async () => {
        const amount = 100;

        expect(await token.allowance(sender, spender.address)).to.equal(0);

        await safeERC20.ensureApprove(token.address, spender.address, amount);

        expect(await token.allowance(sender, spender.address)).to.equal(amount);
    });

    context('with existing allowance', () => {
        const allowance = 1000;

        beforeEach(async () => {
            await safeERC20.ensureApprove(token.address, spender.address, allowance);
        });

        it('should ignore the request when the allowance is sufficient', async () => {
            await safeERC20.ensureApprove(token.address, spender.address, allowance - 10);

            expect(await token.allowance(sender, spender.address)).to.equal(allowance);
        });

        it('should allow increasing the allowance', async () => {
            const newAllowance = allowance + 100;

            await safeERC20.ensureApprove(token.address, spender.address, newAllowance);

            expect(await token.allowance(sender, spender.address)).to.equal(newAllowance);
        });

        it('should ignore the request when the allowance is zero', async () => {
            await safeERC20.ensureApprove(token.address, spender.address, 0);

            expect(await token.allowance(sender, spender.address)).to.equal(allowance);
        });
    });
});
