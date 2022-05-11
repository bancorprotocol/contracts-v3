import Contracts from '../../components/Contracts';
import { NATIVE_TOKEN_ADDRESS } from '../../utils/TokenData';
import { Addressable, toWei } from '../../utils/Types';
import { TokenWithAddress } from './Factory';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, BigNumberish, ContractTransaction, Wallet } from 'ethers';
import { ethers, waffle } from 'hardhat';

export const toAddress = (account: string | Addressable) => (typeof account === 'string' ? account : account.address);

export const getTransactionGas = async (res: ContractTransaction) => {
    const receipt = await res.wait();

    return receipt.cumulativeGasUsed;
};

export const getTransactionCost = async (res: ContractTransaction) => {
    const receipt = await res.wait();

    return receipt.effectiveGasPrice.mul(await getTransactionGas(res));
};

export const getBalance = async (token: TokenWithAddress, account: string | Addressable) => {
    const accountAddress = toAddress(account);
    const tokenAddress = token.address;
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
        return ethers.provider.getBalance(accountAddress);
    }
    return await (await Contracts.ERC20.attach(tokenAddress)).balanceOf(accountAddress);
};

export const getBalances = async (tokens: TokenWithAddress[], account: string | Addressable) => {
    const balances: { [balance: string]: BigNumber } = {};
    for (const token of tokens) {
        balances[token.address] = await getBalance(token, account);
    }

    return balances;
};

export const transfer = async (
    sourceAccount: SignerWithAddress,
    token: TokenWithAddress,
    target: string | Addressable,
    amount: BigNumberish
) => {
    const targetAddress = toAddress(target);
    const tokenAddress = token.address;
    if (tokenAddress === NATIVE_TOKEN_ADDRESS) {
        return await sourceAccount.sendTransaction({ to: targetAddress, value: amount });
    }
    return await (await Contracts.ERC20.attach(tokenAddress)).connect(sourceAccount).transfer(targetAddress, amount);
};

export const createWallet = async () => {
    // create a random wallet, connect it to a test provider, and fund it
    const wallet = Wallet.createRandom().connect(waffle.provider);
    const deployer = (await ethers.getSigners())[0];
    await deployer.sendTransaction({
        value: toWei(10_000_000),
        to: await wallet.getAddress()
    });

    return wallet;
};
